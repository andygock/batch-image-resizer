import { effectiveAdvanced } from "./advancedSettings.js";
import { createJobOwner } from "./jobs.js";
import { processingKey } from "./processingSettings.js";
import { resizeImage } from "./resizeImage.js";

export function resolveSettings(source, settings) {
  const format =
    settings.format === "source" ? source.sourceFormat : settings.format;
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

  return {
    cancel: () => owner.cancel(),
    remove(ids) {
      owner.cancel();
      for (const id of ids) delete records[id];
    },
    clear() {
      owner.cancel();
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
          return [id, { key, status: "pending" }];
        }),
      );
      const started = performance.now();
      const pending = images.filter(
        ({ id }) => records[id].status === "pending",
      );
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
      if (paused) return;
      for (const source of pending) {
        if (!job.isCurrent()) return;
        const options = resolveSettings(source, settings);
        const key = settingsKey(options);
        records[source.id] = { ...records[source.id], status: "processing" };
        publish(snapshot(true));
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
        publish(snapshot(true));
      }
      if (job.isCurrent()) publish(snapshot(false));
    },
  };
}
