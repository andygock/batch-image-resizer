import { createJobOwner } from "./jobs.js";
import { resizeImage } from "./resizeImage.js";
import { createResultCache } from "./resultCache.js";

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
  return JSON.stringify({
    bounds: settings.bounds,
    format: settings.format,
    quality: settings.format === "png" ? null : settings.quality,
    colours: settings.format === "png" ? settings.colours : null,
    disableUpscale: settings.disableUpscale,
  });
}

export function createBatchProcessor(resize = resizeImage) {
  const owner = createJobOwner();
  const cache = createResultCache();
  let records = {};
  let generation = 0;

  return {
    cancel: () => owner.cancel(),
    remove(ids) {
      generation++;
      owner.cancel();
      for (const id of ids) delete records[id];
      cache.retain(new Set(Object.keys(records)));
    },
    clear() {
      generation++;
      owner.cancel();
      cache.clear();
      records = {};
    },
    previous: (id, key) => cache.previous(id, key),
    async preview(source, settings, signal) {
      const revision = generation;
      const options = resolveSettings(source, settings);
      const key = settingsKey(options);
      const cached = cache.get(source.id, key);
      signal.throwIfAborted();
      if (cached) return cached;
      const result = {
        ...(await resize(source, options, signal)),
        settings: options,
      };
      signal.throwIfAborted();
      if (revision === generation) cache.set(source.id, key, result);
      return result;
    },
    async run(
      images,
      settings,
      { paused = false, retryIds = [] } = {},
      publish,
    ) {
      const job = owner.start();
      const ids = new Set(images.map(({ id }) => id));
      cache.retain(ids);
      const retry = new Set(retryIds);
      records = Object.fromEntries(
        images.map((source) => {
          const { id } = source;
          const key = settingsKey(resolveSettings(source, settings));
          const previous = records[id];
          if (previous?.key === key && previous.status === "ready")
            return [id, previous];
          const cached = cache.get(id, key);
          if (cached) return [id, { key, status: "ready", result: cached }];
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
          cache.set(source.id, key, result);
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
