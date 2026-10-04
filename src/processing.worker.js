import { resamplePixels } from "./resamplePixels.js";

self.onmessage = ({ data: { buffer, width, height, target, processing } }) => {
  try {
    const pixels = resamplePixels(
      new Uint8ClampedArray(buffer),
      width,
      height,
      target.width,
      target.height,
      processing,
    );
    self.postMessage({ buffer: pixels.buffer }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message || "Image processing failed." });
  }
};
