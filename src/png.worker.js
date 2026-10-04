import UPNG from "upng-js";
import { sanitiseAdvanced } from "./advancedSettings.js";

self.onmessage = async ({
  data: { buffer, width, height, colours, advanced },
}) => {
  try {
    const options = sanitiseAdvanced(advanced).png;
    if (colours && options.dither) {
      const { ditherPalette } = await import("./paletteDither.js");
      buffer = ditherPalette(buffer, width, height, colours, options.dither);
    }
    // UPNG reserves too little output space for some tiny palette images.
    let encoded = UPNG.encode(
      [buffer],
      width,
      height,
      colours && options.dither ? 0 : colours,
      undefined,
      buffer.byteLength < 4096,
    );
    const bytes = new Uint8Array(encoded);
    const trailer = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
    if (
      !trailer.every((byte, index) => bytes[bytes.length - 12 + index] === byte)
    ) {
      if (
        options.dither ||
        options.level >= 0 ||
        options.interlace ||
        options.optimiseAlpha
      ) {
        if (colours && !options.dither)
          throw new Error(
            "PNG palette reduction produced incomplete output. Try dithering or lossless colours.",
          );
        // Preserve already-dithered pixels and still honour optimisation options.
        const canvas = new OffscreenCanvas(width, height);
        try {
          canvas
            .getContext("2d")
            .putImageData(
              new ImageData(new Uint8ClampedArray(buffer), width, height),
              0,
              0,
            );
          encoded = await (
            await canvas.convertToBlob({ type: "image/png" })
          ).arrayBuffer();
        } finally {
          canvas.width = canvas.height = 0;
        }
      } else {
        self.postMessage({ fallback: true });
        return;
      }
    }
    if (options.level >= 0 || options.interlace || options.optimiseAlpha) {
      const { optimisePng } = await import("./advancedCodecs.js");
      let pixels;
      if (options.interlace) {
        const png = UPNG.decode(encoded);
        pixels = {
          data: new Uint8ClampedArray(UPNG.toRGBA8(png)[0]),
          width,
          height,
        };
      }
      encoded = await optimisePng(encoded, options, pixels);
    }
    self.postMessage({ buffer: encoded }, [encoded]);
  } catch (error) {
    self.postMessage({ error: error.message || "PNG encoding failed." });
  }
};
