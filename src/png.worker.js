import UPNG from "upng-js";

self.onmessage = ({ data: { buffer, width, height, colours } }) => {
  try {
    // UPNG reserves too little output space for some tiny palette images.
    const encoded = UPNG.encode(
      [buffer],
      width,
      height,
      colours,
      undefined,
      buffer.byteLength < 4096
    );
    const bytes = new Uint8Array(encoded);
    const trailer = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
    if (
      !trailer.every((byte, index) => bytes[bytes.length - 12 + index] === byte)
    ) {
      self.postMessage({ fallback: true });
      return;
    }
    self.postMessage({ buffer: encoded }, [encoded]);
  } catch (error) {
    self.postMessage({ error: error.message || "PNG encoding failed." });
  }
};
