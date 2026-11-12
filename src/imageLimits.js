export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_BATCH_BYTES = 256 * 1024 * 1024;
export const MAX_SOURCE_PIXELS = 33_554_432;
export const MAX_PROCESSING_BYTES = 512 * 1024 * 1024;
const HEADER_BYTES = 1024 * 1024;

export class ImageLimitError extends Error {}

export function validateSourceDimensions(width, height) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new ImageLimitError("The image has invalid dimensions.");
  if (width * height > MAX_SOURCE_PIXELS)
    throw new ImageLimitError(
      "Source images are limited to 33,554,432 pixels.",
    );
}

export function validateFileSize(file) {
  if (file?.size > MAX_FILE_BYTES)
    throw new ImageLimitError("Each source file must be 64 MiB or smaller.");
}

export function validateProcessingAllocation(input, target, processing) {
  validateSourceDimensions(input.width, input.height);
  validateSourceDimensions(target.width, target.height);
  const resized =
    input.width !== target.width || input.height !== target.height;
  const intermediatePixels = resized
    ? Math.min(input.width * target.height, target.width * input.height)
    : 0;
  // Estimate decoded pixels, canvases, transferred RGBA, resampling floats and
  // sharpening rows. Codec memory and the compressed batch are additional.
  const bytes =
    input.width * input.height * 12 +
    target.width * target.height * 8 +
    intermediatePixels * 16 +
    (processing.sharpen
      ? (Math.ceil(processing.radius * 3) * 2 + 1) * target.width * 16
      : 0);
  if (bytes > MAX_PROCESSING_BYTES)
    throw new ImageLimitError(
      "Image processing working buffers exceed 512 MiB. Use Auto without sharpening, or smaller input/output dimensions.",
    );
}

// Header inspection is bounded; decoders still validate dimensions when a
// format places its dimension metadata beyond this prefix.
export function headerDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at, length) =>
    String.fromCharCode(...bytes.subarray(at, at + length));
  if (bytes.length >= 24 && text(1, 3) === "PNG" && text(12, 4) === "IHDR")
    return [view.getUint32(16), view.getUint32(20)];
  if (bytes.length >= 26 && text(0, 2) === "BM") {
    const headerSize = view.getUint32(14, true);
    if (headerSize === 12)
      return [view.getUint16(18, true), view.getUint16(20, true)];
    // Windows DIB headers use signed dimensions; negative height means top-down.
    if (headerSize >= 40)
      return [view.getInt32(18, true), Math.abs(view.getInt32(22, true))];
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 255) break;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (at + 2 > bytes.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 7
      )
        return [view.getUint16(at + 5), view.getUint16(at + 3)];
      at += length;
    }
  }
  if (bytes.length >= 25 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    const kind = text(12, 4);
    const uint24 = (at) =>
      bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
    if (kind === "VP8X" && bytes.length >= 30)
      return [uint24(24) + 1, uint24(27) + 1];
    if (
      kind === "VP8 " &&
      bytes.length >= 30 &&
      bytes[23] === 0x9d &&
      bytes[24] === 1 &&
      bytes[25] === 0x2a
    )
      return [
        view.getUint16(26, true) & 0x3fff,
        view.getUint16(28, true) & 0x3fff,
      ];
    if (kind === "VP8L" && bytes[20] === 0x2f) {
      const packed = view.getUint32(21, true);
      return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
    }
  }
  if (text(4, 4) === "ftyp") {
    const walk = (start, end, depth = 0) => {
      if (depth > 8) return null;
      for (let at = start; at + 8 <= end; ) {
        const size = view.getUint32(at);
        const kind = text(at + 4, 4);
        if (size < 8) break;
        const boxEnd = Math.min(end, at + size);
        if (kind === "ispe" && size >= 20 && at + 20 <= end) {
          const dimensions = [view.getUint32(at + 12), view.getUint32(at + 16)];
          validateSourceDimensions(...dimensions);
        }
        if (["meta", "iprp", "ipco"].includes(kind))
          walk(at + (kind === "meta" ? 12 : 8), boxEnd, depth + 1);
        at += size;
      }
      return null;
    };
    walk(0, bytes.length);
  }
  return null;
}

export async function preflightImage(file, signal) {
  signal?.throwIfAborted();
  validateFileSize(file);
  // Some callers supply decoder handles rather than Blobs.
  if (typeof file.slice !== "function") return;
  const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  signal?.throwIfAborted();
  const dimensions = headerDimensions(bytes);
  if (dimensions) validateSourceDimensions(...dimensions);
}
