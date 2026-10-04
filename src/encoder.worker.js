import { encodeAdvanced } from "./advancedCodecs.js";

self.onmessage = async ({ data: { buffer, width, height, settings } }) => {
  try {
    const encoded = await encodeAdvanced(
      { data: new Uint8ClampedArray(buffer), width, height },
      settings,
    );
    self.postMessage({ buffer: encoded }, [encoded]);
  } catch (error) {
    self.postMessage({ error: error.message || "Advanced encoding failed." });
  }
};
