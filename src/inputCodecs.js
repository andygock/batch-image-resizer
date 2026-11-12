import { validateSourceDimensions } from "./imageLimits.js";

export async function decodeHeic(buffer) {
  // Ship the unmodified LGPL module separately so it remains replaceable.
  const { default: url } = await import(
    "libheif-js/libheif-wasm/libheif-bundle.mjs?url"
  );
  const { default: factory } = await import(/* @vite-ignore */ url);
  const codec = await factory();
  const decoder = new codec.HeifDecoder();
  let images = [];
  try {
    images = decoder.decode(new Uint8Array(buffer));
    const image = images.find((image) => image.is_primary()) ?? images[0];
    if (!image)
      throw new Error("No readable image was found in the HEIC/HEIF file.");
    const width = image.get_width();
    const height = image.get_height();
    validateSourceDimensions(width, height);
    return await new Promise((resolve, reject) => {
      image.display(
        { width, height, data: new Uint8ClampedArray(width * height * 4) },
        (pixels) => {
          if (pixels) resolve(pixels);
          else reject(new Error("HEIC/HEIF pixel decoding failed."));
        },
      );
    });
  } finally {
    for (const image of images) image.free();
    if (decoder.decoder) codec.heif_context_free(decoder.decoder);
  }
}

export async function decodeTiff(buffer) {
  const { default: UTIF } = await import("utif");
  const page = UTIF.decode(buffer)[0];
  if (!page) throw new Error("No readable page was found in the TIFF file.");
  const width = page.t256?.[0];
  const height = page.t257?.[0];
  validateSourceDimensions(width, height);
  UTIF.decodeImage(buffer, page);
  const data = UTIF.toRGBA8(page);
  if (data.byteLength !== width * height * 4)
    throw new Error("Invalid TIFF pixels.");
  return orientTiff({ width, height, data }, page.t274?.[0] ?? 1);
}

function orientTiff(pixels, orientation) {
  if (orientation === 1) return pixels;
  if (!Number.isInteger(orientation) || orientation < 1 || orientation > 8)
    throw new Error("Invalid TIFF orientation.");
  const { width, height, data } = pixels;
  const swapped = orientation >= 5;
  const output = {
    width: swapped ? height : width,
    height: swapped ? width : height,
    data: new Uint8Array(data.length),
  };
  const flipX = [2, 3, 6, 7].includes(orientation);
  const flipY = [3, 4, 7, 8].includes(orientation);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx = swapped ? y : x;
      let dy = swapped ? x : y;
      if (flipX) dx = output.width - 1 - dx;
      if (flipY) dy = output.height - 1 - dy;
      const start = (y * width + x) * 4;
      output.data.set(
        data.subarray(start, start + 4),
        (dy * output.width + dx) * 4,
      );
    }
  }
  return output;
}
