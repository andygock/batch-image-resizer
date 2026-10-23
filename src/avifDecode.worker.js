import { decodeAvif } from "./avifCodec.js";
import { validateSourceDimensions } from "./imageLimits.js";

self.onmessage = async ({ data: { buffer } }) => {
  try {
    const pixels = await decodeAvif(buffer);
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
    self.postMessage({ error: error.message || "AVIF decoding failed." });
  }
};
