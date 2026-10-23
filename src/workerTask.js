const pools = new Set();

export function disposeWorkerPools() {
  for (const dispose of pools) dispose();
}

// Each request exclusively owns a worker. Only one idle worker is retained per
// task, so an inspector trial can overlap a batch without sharing callbacks.
export function createWorkerTask(
  createWorker,
  { label, reuse = false, idleMs = 10_000, validate = () => {} },
) {
  let idle;
  let timer;
  let generation = 0;
  const dispose = () => {
    generation++;
    clearTimeout(timer);
    idle?.terminate();
    idle = undefined;
  };
  pools.add(dispose);
  return (message, signal, transfer = []) =>
    new Promise((resolve, reject) => {
      signal.throwIfAborted();
      clearTimeout(timer);
      const worker = idle ?? createWorker();
      const requestGeneration = generation;
      idle = undefined;
      let settled = false;
      const finish = (error, data) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        if (
          !error &&
          reuse &&
          !data.fallback &&
          !idle &&
          requestGeneration === generation
        ) {
          idle = worker;
          worker.onerror = dispose;
          worker.onmessageerror = dispose;
          timer = setTimeout(dispose, idleMs);
          timer.unref?.();
        } else worker.terminate();
        if (error) reject(error);
        else resolve(data);
      };
      const abort = () => finish(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }) => {
        try {
          if (!data || typeof data !== "object")
            throw new Error(`Invalid ${label} response.`);
          if (data.error) throw new Error(data.error);
          validate(data, message);
          finish(null, data);
        } catch (error) {
          finish(error);
        }
      };
      worker.onerror = () => finish(new Error(`${label} worker failed.`));
      worker.onmessageerror = () =>
        finish(new Error(`Invalid ${label} worker response.`));
      try {
        worker.postMessage(message, transfer);
      } catch (error) {
        finish(error);
      }
    });
}
