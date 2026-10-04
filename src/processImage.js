export async function drawProcessed(
  context,
  bitmap,
  target,
  processing,
  signal,
) {
  const advanced =
    processing.method === "lanczos3" || processing.method === "mitchell";
  const input = advanced ? bitmap : target;
  if (
    input.width * input.height > 33_554_432 ||
    target.width * target.height > 33_554_432
  )
    throw new Error(
      "Image processing supports up to 33,554,432 pixels. Use Auto without sharpening, or smaller output dimensions.",
    );
  const canvas = new OffscreenCanvas(input.width, input.height);
  try {
    const source = canvas.getContext("2d");
    if (!source) throw new Error("Canvas context unavailable.");
    source.imageSmoothingEnabled = processing.method !== "nearest";
    source.imageSmoothingQuality = "high";
    source.drawImage(bitmap.image, 0, 0, input.width, input.height);
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
            width: input.width,
            height: input.height,
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
