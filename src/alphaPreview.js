import { decodeImage } from "./decodeImage.js";

export function showAlpha(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3];
    pixels[i + 3] = 255;
  }
  return pixels;
}

export async function createAlphaPreview(blob, width, height, signal) {
  let decoded;
  let canvas;
  try {
    decoded = await decodeImage(blob, signal);
    signal.throwIfAborted();
    const w = width || decoded.width;
    const h = height || decoded.height;
    if (w * h > 33_554_432)
      throw new Error(
        "Use smaller output dimensions to inspect the alpha channel.",
      );
    canvas = new OffscreenCanvas(w, h);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable.");
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.image, 0, 0, w, h);
    const pixels = context.getImageData(0, 0, w, h);
    showAlpha(pixels.data);
    context.putImageData(pixels, 0, 0);
    const preview = await canvas.convertToBlob({ type: "image/png" });
    signal.throwIfAborted();
    return preview;
  } finally {
    decoded?.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
