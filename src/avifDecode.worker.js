import { decodeAvif } from "./avifCodec.js";

self.onmessage = async ({ data: { buffer } }) => {
  try {
    const pixels = await decodeAvif(buffer);
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
