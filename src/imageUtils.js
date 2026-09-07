export const MAX_DIMENSION = 8192;
export const MAX_PIXELS = 16_777_216;

export const outputFormats = {
  jpeg: { mimeType: "image/jpeg", extension: "jpg" },
  png: { mimeType: "image/png", extension: "png" },
  webp: { mimeType: "image/webp", extension: "webp" },
};

export function validateSize({ width, height }) {
  if (
    ![width, height].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= MAX_DIMENSION
    )
  ) {
    throw new Error(
      `Dimensions must be whole numbers between 1 and ${MAX_DIMENSION}.`
    );
  }
  if (width * height > MAX_PIXELS) {
    throw new Error(
      `Maximum output area is ${MAX_PIXELS.toLocaleString("en-AU")} pixels.`
    );
  }
}

export function fitDimensions(width, height, bounds, disableUpscale) {
  validateSize(bounds);
  if (![width, height].every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error("Invalid source dimensions.");
  }
  const scale = Math.min(
    bounds.width / width,
    bounds.height / height,
    disableUpscale ? 1 : Infinity
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function nameOutputs(images, enableSuffix, suffix) {
  const used = new Set();
  return images.map((image) => {
    const dot = image.filename.lastIndexOf(".");
    const stem = dot > 0 ? image.filename.slice(0, dot) : image.filename;
    // Portable, flat ZIP entries; normalise names before checking collisions.
    // Control characters are deliberately removed from filesystem names.
    /* eslint-disable no-control-regex */
    let base =
      `${stem}${enableSuffix ? suffix : ""}`
        .normalize("NFC")
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .replace(/^[. ]+|[. ]+$/g, "")
        .slice(0, 160) || "image";
    /* eslint-enable no-control-regex */
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))
      base = `_${base}`;
    let name = `${base}.${image.outputExtension}`;
    let number = 2;
    while (used.has(name.toLowerCase()))
      name = `${base} (${number++}).${image.outputExtension}`;
    used.add(name.toLowerCase());
    return { ...image, downloadFilename: name };
  });
}
