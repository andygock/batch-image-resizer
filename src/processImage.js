export async function drawProcessed(
  context,
  bitmap,
  target,
  processing,
  signal,
) {
  if (bitmap.width * bitmap.height > 33_554_432)
    throw new Error(
      "Advanced resizing supports sources up to 33,554,432 pixels. Use Auto for this image.",
    );
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  try {
    const source = canvas.getContext("2d");
    if (!source) throw new Error("Canvas context unavailable.");
    source.drawImage(bitmap.image, 0, 0);
    const pixels = source.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = await new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const worker = new Worker(
        new URL("./processing.worker.js", import.meta.url),
        { type: "module" },
      );
      const finish = (error, buffer) => {
        signal.removeEventListener("abort", abort);
        worker.terminate();
        if (error) reject(error);
        else resolve(buffer);
      };
      const abort = () => finish(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }) =>
        finish(
          data.error
            ? new Error(data.error)
            : data.buffer?.byteLength !== target.width * target.height * 4
              ? new Error("Invalid processed image.")
              : null,
          data.buffer,
        );
      worker.onerror = () =>
        finish(new Error("Image processing worker failed."));
      worker.onmessageerror = () =>
        finish(new Error("Invalid processing worker response."));
      try {
        worker.postMessage(
          {
            buffer: pixels.data.buffer,
            width: bitmap.width,
            height: bitmap.height,
            target,
            processing,
          },
          [pixels.data.buffer],
        );
      } catch (error) {
        finish(error);
      }
    });
    signal.throwIfAborted();
    canvas.width = target.width;
    canvas.height = target.height;
    source.putImageData(
      new ImageData(new Uint8ClampedArray(buffer), target.width, target.height),
      0,
      0,
    );
    context.drawImage(canvas, 0, 0);
  } finally {
    canvas.width = canvas.height = 0;
  }
}
