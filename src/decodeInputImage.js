import { preflightImage, validateSourceDimensions } from "./imageLimits.js";
import { createWorkerTask } from "./workerTask.js";

const inputTask = createWorkerTask(
  () =>
    new Worker(new URL("./inputDecode.worker.js", import.meta.url), {
      type: "module",
    }),
  {
    label: "Input decoder",
    validate: (data) => {
      validateSourceDimensions(data.width, data.height);
      if (data.buffer?.byteLength !== data.width * data.height * 4)
        throw new Error("Invalid decoded input pixels.");
    },
  },
);

export async function decodeInputImage(file, signal) {
  await preflightImage(file, signal);
  const buffer = await file.arrayBuffer();
  signal.throwIfAborted();
  const pixels = await inputTask({ buffer, type: file.type }, signal, [buffer]);
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
