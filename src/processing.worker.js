import { resamplePixels } from "./resamplePixels.js";
import { sharpenPixels } from "./sharpenPixels.js";

self.onmessage = ({ data: { buffer, width, height, target, processing } }) => {
  try {
    const resized =
      width === target.width && height === target.height
        ? new Uint8ClampedArray(buffer)
        : resamplePixels(
            new Uint8ClampedArray(buffer),
            width,
            height,
            target.width,
            target.height,
            processing,
          );
    const pixels = sharpenPixels(
      resized,
      target.width,
      target.height,
      processing,
    );
    self.postMessage({ buffer: pixels.buffer }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message || "Image processing failed." });
  }
};
