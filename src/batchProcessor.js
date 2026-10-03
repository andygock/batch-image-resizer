import { createJobOwner } from "./jobs.js";
import { resizeImage } from "./resizeImage.js";

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
  const cache = new Map();
  let records = {};

  return {
    cancel: () => owner.cancel(),
    clear() {
      owner.cancel();
      cache.clear();
      records = {};
    },
    async run(images, settings, { paused = false, retryIds = [] } = {}, publish) {
      const job = owner.start();
      const key = settingsKey(settings);
      const ids = new Set(images.map(({ id }) => id));
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
      const retry = new Set(retryIds);
      records = Object.fromEntries(images.map(({ id }) => {
        const previous = records[id];
        const cached = cache.get(id);
        if (cached?.key === key) return [id, { key, status: "ready", result: cached.result }];
        if (previous?.key === key && previous.status === "error" && !retry.has(id))
          return [id, previous];
        return [id, { key, status: "pending", result: previous?.result }];
      }));
      const started = performance.now();
      const pending = images.filter(({ id }) => records[id].status === "pending");
      const snapshot = (isProcessing) => ({
        records: { ...records },
        isProcessing,
        progress: Object.values(records).filter(({ status }) => status === "ready" || status === "error").length,
        processingTime: Number(((performance.now() - started) / 1000).toFixed(2)),
      });
      publish(snapshot(!paused && pending.length > 0));
      if (paused) return;
      for (const source of pending) {
        if (!job.isCurrent()) return;
        records[source.id] = { ...records[source.id], status: "processing" };
        publish(snapshot(true));
        try {
          const result = await resize(source, settings, job.signal);
          if (!job.isCurrent()) return;
          cache.set(source.id, { key, result });
          records[source.id] = { key, status: "ready", result };
        } catch (error) {
          if (!job.isCurrent()) return;
          records[source.id] = {
            ...records[source.id], status: "error", error: error.message,
          };
        }
        publish(snapshot(true));
      }
      if (job.isCurrent()) publish(snapshot(false));
    },
  };
}
