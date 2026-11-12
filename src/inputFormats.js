export const inputMimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heic: "image/heic",
  tiff: "image/tiff",
  svg: "image/svg+xml",
};

export const inputAccept = `${Object.values(inputMimeTypes).join(", ")}, image/heif, .bmp, .gif, .heic, .heif, .tif, .tiff, .svg`;

export const needsStaticPreview = (type) =>
  [
    "image/heic",
    "image/heif",
    "image/tiff",
    "image/gif",
    "image/svg+xml",
  ].includes(type);

// Only the document prefix is inspected here. XML parsing validates SVG on decode.
export function isSvgPrefix(bytes) {
  const text = new TextDecoder().decode(bytes);
  return /^\s*(?:<\?xml\s[^?]*\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE\s+svg\s[^>]*>)\s*)*<(?:[A-Za-z_][\w.-]*:)?svg(?=[\s/>])/i.test(
    text,
  );
}
