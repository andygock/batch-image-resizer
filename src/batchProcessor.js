import { effectiveAdvanced } from "./advancedSettings.js";
import { resolveOutputFormat } from "./imageUtils.js";
import { createJobOwner } from "./jobs.js";
import { processingKey } from "./processingSettings.js";
import { resizeImage } from "./resizeImage.js";

export function resolveSettings(source, settings) {
  const format = resolveOutputFormat(settings.format, source.sourceFormat);
  return {
    ...settings,
    format,
    quality: settings.qualityByFormat?.[format] ?? settings.quality,
  };
}

export function settingsKey(settings) {
  const advanced = effectiveAdvanced(settings);
  return JSON.stringify({
    bounds: settings.bounds,
    format: settings.format,
    quality:
      settings.format === "png" ||
      (settings.format === "webp" &&
        advanced.encoder === "advanced" &&
        (advanced.mode !== "lossy" || advanced.targetSizeKB > 0))
        ? null
        : settings.quality,
    advanced,
    processing: processingKey(settings.processing),
    colours: settings.format === "png" ? settings.colours : null,
    disableUpscale: settings.disableUpscale,
  });
}

export function createBatchProcessor(resize = resizeImage) {
  const owner = createJobOwner();
  let records = {};
  let active = null;
  const cancel = () => {
    owner.cancel();
    active = null;
  };

  return {
    cancel,
    remove(ids) {
      cancel();
      const removed = {};
      let bytes = 0;
      // Undo retains at most 32 MiB of outputs; larger outputs are regenerated.
      for (const id of ids) {
        const record = records[id];
        if (!record) continue;
        bytes += record.result?.blob?.size ?? 0;
        removed[id] =
          bytes <= 32 * 1024 * 1024
            ? record
            : { key: record.key, status: "pending" };
      }
      for (const id of ids) delete records[id];
      return removed;
    },
    restore(restored) {
      cancel();
      records = { ...records, ...restored };
    },
    clear() {
      cancel();
      records = {};
    },
    async preview(source, settings, signal) {
      const options = resolveSettings(source, settings);
      signal.throwIfAborted();
      const result = {
        ...(await resize(source, options, signal)),
        settings: options,
      };
      signal.throwIfAborted();
      return result;
    },
    async run(
      images,
      settings,
      { paused = false, retryIds = [] } = {},
      publish,
    ) {
      const incoming = new Map(images.map((source) => [source.id, source]));
      if (
        active?.job.isCurrent() &&
        !paused &&
        !retryIds.length &&
        [...active.sources].every(
          ([id, source]) => incoming.get(id) === source,
        ) &&
        images.every(
          (source) =>
            !records[source.id] ||
            records[source.id].key ===
              settingsKey(resolveSettings(source, settings)),
        )
      ) {
        // Appending imports must not restart an image that is already encoding.
        for (const source of images)
          if (!active.sources.has(source.id)) {
            records[source.id] = {
              key: settingsKey(resolveSettings(source, settings)),
              status: "pending",
            };
            active.pending.push(source);
          }
        active.sources = incoming;
        active.settings = settings;
        active.publish = publish;
        publish(active.snapshot(true));
        return active.promise;
      }
      cancel();
      const job = owner.start();
      const retry = new Set(retryIds);
      records = Object.fromEntries(
        images.map((source) => {
          const { id } = source;
          const key = settingsKey(resolveSettings(source, settings));
          const previous = records[id];
          if (previous?.key === key && previous.status === "ready")
            return [id, previous];
          if (
            previous?.key === key &&
            previous.status === "error" &&
            !retry.has(id)
          )
            return [id, previous];
          return [id, { key, status: "pending", result: previous?.result }];
        }),
      );
      const started = performance.now();
      const pending = images.filter(
        ({ id }) => records[id].status === "pending",
      );
      const run = {
        job,
        pending,
        sources: incoming,
        settings,
        publish,
        promise: null,
      };
      const snapshot = (isProcessing) => ({
        records: { ...records },
        isProcessing,
        progress: Object.values(records).filter(
          ({ status }) => status === "ready" || status === "error",
        ).length,
        processingTime: Number(
          ((performance.now() - started) / 1000).toFixed(2),
        ),
      });
      publish(snapshot(!paused && pending.length > 0));
      if (paused || !pending.length) return;
      run.snapshot = snapshot;
      active = run;
      run.promise = (async () => {
        for (const source of pending) {
          if (!job.isCurrent()) return;
          const options = resolveSettings(source, run.settings);
          const key = settingsKey(options);
          records[source.id] = { ...records[source.id], status: "processing" };
          run.publish(snapshot(true));
          try {
            const result = {
              ...(await resize(source, options, job.signal)),
              settings: options,
            };
            if (!job.isCurrent()) return;
            records[source.id] = { key, status: "ready", result };
          } catch (error) {
            if (!job.isCurrent()) return;
            records[source.id] = {
              ...records[source.id],
              status: "error",
              error: error.message,
            };
          }
          run.publish(snapshot(true));
        }
        if (job.isCurrent()) {
          active = null;
          run.publish(snapshot(false));
        }
      })();
      return run.promise;
    },
  };
}
