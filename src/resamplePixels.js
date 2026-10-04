const toLinear = (value) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const toSrgb = (value) =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
const linearTable = Float64Array.from({ length: 256 }, (_, value) =>
  toLinear(value / 255),
);
const clamp = (value) => Math.max(0, Math.min(1, value));

function kernel(x, method) {
  x = Math.abs(x);
  if (method === "lanczos3") {
    if (x >= 3) return 0;
    if (x < 1e-8) return 1;
    return (
      (Math.sin(Math.PI * x) * Math.sin((Math.PI * x) / 3)) /
      ((Math.PI * Math.PI * x * x) / 3)
    );
  }
  // Mitchell–Netravali with B = C = 1/3 balances softness and ringing.
  if (x >= 2) return 0;
  return x < 1
    ? (7 * x ** 3 - 12 * x ** 2 + 16 / 3) / 6
    : ((-7 / 3) * x ** 3 + 12 * x ** 2 - 20 * x + 32 / 3) / 6;
}

function contributions(source, target, method) {
  const scale = Math.min(1, target / source);
  const radius = (method === "lanczos3" ? 3 : 2) / scale;
  return Array.from({ length: target }, (_, index) => {
    const centre = ((index + 0.5) * source) / target - 0.5;
    const weights = new Map();
    let total = 0;
    for (
      let sample = Math.ceil(centre - radius);
      sample <= Math.floor(centre + radius);
      sample++
    ) {
      const weight = kernel((sample - centre) * scale, method);
      if (!weight) continue;
      const bounded = Math.max(0, Math.min(source - 1, sample));
      weights.set(bounded, (weights.get(bounded) || 0) + weight);
      total += weight;
    }
    return [...weights].map(([index, weight]) => [index, weight / total]);
  });
}

export function resamplePixels(
  input,
  width,
  height,
  targetWidth,
  targetHeight,
  options,
) {
  if (width === targetWidth && height === targetHeight) return input;
  if (options.method === "nearest") {
    const result = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    for (let y = 0; y < targetHeight; y++)
      for (let x = 0; x < targetWidth; x++) {
        const offset =
          (Math.min(
            height - 1,
            Math.floor(((y + 0.5) * height) / targetHeight),
          ) *
            width +
            Math.min(
              width - 1,
              Math.floor(((x + 0.5) * width) / targetWidth),
            )) *
          4;
        result.set(
          input.subarray(offset, offset + 4),
          (y * targetWidth + x) * 4,
        );
      }
    return result;
  }
  const xWeights = contributions(width, targetWidth, options.method);
  const yWeights = contributions(height, targetHeight, options.method);
  // Choose the pass order with the smaller intermediate allocation.
  const horizontal = targetWidth * height <= width * targetHeight;
  const intermediateWidth = horizontal ? targetWidth : width;
  const intermediateHeight = horizontal ? height : targetHeight;
  const intermediate = new Float32Array(
    intermediateWidth * intermediateHeight * 4,
  );
  for (let y = 0; y < intermediateHeight; y++)
    for (let x = 0; x < intermediateWidth; x++) {
      const target = (y * intermediateWidth + x) * 4;
      for (const [sample, weight] of horizontal ? xWeights[x] : yWeights[y]) {
        const source =
          (horizontal ? y * width + sample : sample * width + x) * 4;
        const alpha = input[source + 3] / 255;
        for (let channel = 0; channel < 3; channel++) {
          const colour = options.linearRGB
            ? linearTable[input[source + channel]]
            : input[source + channel] / 255;
          intermediate[target + channel] +=
            colour * (options.premultiply ? alpha : 1) * weight;
        }
        intermediate[target + 3] += alpha * weight;
      }
    }
  const result = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++)
    for (let x = 0; x < targetWidth; x++) {
      const sums = [0, 0, 0, 0];
      for (const [sample, weight] of horizontal ? yWeights[y] : xWeights[x]) {
        const source =
          (horizontal
            ? sample * intermediateWidth + x
            : y * intermediateWidth + sample) * 4;
        for (let channel = 0; channel < 4; channel++)
          sums[channel] += intermediate[source + channel] * weight;
      }
      const target = (y * targetWidth + x) * 4;
      const alpha = clamp(sums[3]);
      for (let channel = 0; channel < 3; channel++) {
        const colour = clamp(
          options.premultiply
            ? alpha > 1e-8
              ? sums[channel] / alpha
              : 0
            : sums[channel],
        );
        result[target + channel] =
          255 * (options.linearRGB ? toSrgb(colour) : colour);
      }
      result[target + 3] = alpha * 255;
    }
  return result;
}
