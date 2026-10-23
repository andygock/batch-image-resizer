import { sanitiseProcessing } from "./processingSettings.js";

export function sharpenPixels(pixels, width, height, processing) {
  const { sharpen, amount, radius, threshold } = sanitiseProcessing(processing);
  if (!sharpen || !amount) return pixels;
  const extent = Math.ceil(radius * 3);
  const kernel = Array.from({ length: extent * 2 + 1 }, (_, i) =>
    Math.exp(-((i - extent) ** 2) / (2 * radius * radius)),
  );
  const sum = kernel.reduce((total, weight) => total + weight, 0);
  const weights = kernel.map((weight) => weight / sum);
  // Retain only the horizontal rows needed by the vertical kernel.
  // Blur premultiplied colour and opacity together so hidden RGB cannot bleed.
  const rows = new Map();
  const rowAt = (y) => {
    if (rows.has(y)) return rows.get(y);
    const row = new Float32Array(width * 4);
    for (let x = 0; x < width; x++) {
      const out = x * 4;
      for (let k = -extent; k <= extent; k++) {
        const src = (y * width + Math.max(0, Math.min(width - 1, x + k))) * 4;
        const weight = weights[k + extent];
        const alpha = pixels[src + 3] / 255;
        for (let c = 0; c < 3; c++)
          row[out + c] += pixels[src + c] * alpha * weight;
        row[out + 3] += alpha * weight;
      }
    }
    rows.set(y, row);
    return row;
  };
  const result = new Uint8ClampedArray(pixels);
  for (let y = 0; y < height; y++) {
    rows.delete(y - extent - 1);
    const neighbourhood = weights.map((_, k) =>
      rowAt(Math.max(0, Math.min(height - 1, y + k - extent))),
    );
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      if (!pixels[out + 3]) continue;
      const blurred = [0, 0, 0, 0];
      for (let k = -extent; k <= extent; k++) {
        const row = neighbourhood[k + extent];
        const src = x * 4;
        for (let c = 0; c < 4; c++)
          blurred[c] += row[src + c] * weights[k + extent];
      }
      for (let c = 0; c < 3; c++) {
        const difference = pixels[out + c] - blurred[c] / blurred[3];
        if (Math.abs(difference) > threshold)
          result[out + c] = pixels[out + c] + amount * difference;
      }
    }
  }
  return result;
}
