import { validateSourceDimensions } from "./imageLimits.js";
import { decodeHeic, decodeTiff } from "./inputCodecs.js";

self.onmessage = async ({ data: { buffer, type } }) => {
  try {
    const pixels = await (type === "image/tiff"
      ? decodeTiff(buffer)
      : decodeHeic(buffer));
    validateSourceDimensions(pixels.width, pixels.height);
    self.postMessage(
      {
        buffer: pixels.data.buffer,
        width: pixels.width,
        height: pixels.height,
      },
      [pixels.data.buffer],
    );
  } catch (error) {
    self.postMessage({
      error: error.message || "Input image decoding failed.",
    });
  }
};
