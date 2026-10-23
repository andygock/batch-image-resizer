import { validateProcessingAllocation } from "./imageLimits.js";
import { createWorkerTask } from "./workerTask.js";

const processingTask = createWorkerTask(
  () =>
    new Worker(new URL("./processing.worker.js", import.meta.url), {
      type: "module",
    }),
  {
    label: "Image processing",
    validate: (data, { target }) => {
      if (data.buffer?.byteLength !== target.width * target.height * 4)
        throw new Error("Invalid processed image.");
    },
  },
);

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
  validateProcessingAllocation(input, target, processing);
  const canvas = new OffscreenCanvas(input.width, input.height);
  try {
    const source = canvas.getContext("2d");
    if (!source) throw new Error("Canvas context unavailable.");
    source.imageSmoothingEnabled = processing.method !== "nearest";
    source.imageSmoothingQuality = "high";
    source.drawImage(bitmap.image, 0, 0, input.width, input.height);
    const pixels = source.getImageData(0, 0, canvas.width, canvas.height);
    const { buffer } = await processingTask(
      {
        buffer: pixels.data.buffer,
        width: input.width,
        height: input.height,
        target,
        processing,
      },
      signal,
      [pixels.data.buffer],
    );
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
