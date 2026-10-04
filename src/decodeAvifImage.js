export async function decodeAvifImage(file, signal) {
  signal.throwIfAborted();
  const buffer = await file.arrayBuffer();
  signal.throwIfAborted();
  const pixels = await new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./avifDecode.worker.js", import.meta.url),
      { type: "module" },
    );
    const finish = (error, value) => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) =>
      finish(
        data.error
          ? new Error(data.error)
          : !Number.isInteger(data.width) ||
              !Number.isInteger(data.height) ||
              data.width <= 0 ||
              data.height <= 0 ||
              data.buffer?.byteLength !== data.width * data.height * 4
            ? new Error("Invalid AVIF pixels.")
            : null,
        data,
      );
    worker.onerror = () => finish(new Error("AVIF decoder worker failed."));
    worker.onmessageerror = () =>
      finish(new Error("Invalid AVIF decoder response."));
    try {
      worker.postMessage({ buffer }, [buffer]);
    } catch (error) {
      finish(error);
    }
  });
  signal.throwIfAborted();
  const image = new OffscreenCanvas(pixels.width, pixels.height);
  const close = () => {
    image.width = image.height = 0;
  };
  try {
    image
      .getContext("2d")
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(pixels.buffer),
          pixels.width,
          pixels.height,
        ),
        0,
        0,
      );
    return { image, width: pixels.width, height: pixels.height, close };
  } catch (error) {
    close();
    throw error;
  }
}
