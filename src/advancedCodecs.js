import { jpegOptions, webpOptions } from "./advancedSettings.js";

const initialisations = new Map();
function initialise(key, load) {
  if (!initialisations.has(key))
    initialisations.set(
      key,
      load().catch((error) => {
        initialisations.delete(key);
        throw error;
      }),
    );
  return initialisations.get(key);
}

// Explicit asset URLs let Vite serve and bundle WASM without a CDN or runtime paths.
export async function encodeAdvanced(pixels, settings) {
  if (settings.format === "avif") {
    const { encodeAvif } = await import("./avifCodec.js");
    return encodeAvif(pixels, settings);
  }
  if (settings.format === "webp") {
    const { default: encode, init } = await import("@jsquash/webp/encode.js");
    const [{ default: scalar }, { default: simd }] = await Promise.all([
      import("@jsquash/webp/codec/enc/webp_enc.wasm?url"),
      import("@jsquash/webp/codec/enc/webp_enc_simd.wasm?url"),
    ]);
    await initialise("webp", () =>
      init({
        locateFile: (file) => (file.includes("simd") ? simd : scalar),
      }),
    );
    return encode(pixels, webpOptions(settings));
  }
  const { default: encode, init } = await import("@jsquash/jpeg/encode.js");
  const { default: wasm } = await import(
    "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url"
  );
  await initialise("jpeg", () => init({ locateFile: () => wasm }));
  return encode(pixels, jpegOptions(settings));
}

export async function optimisePng(buffer, options, pixels) {
  // A single-thread module inside our cancellable worker avoids nested workers
  // and does not require cross-origin isolation headers from the host.
  const {
    default: init,
    optimise,
    optimise_raw,
  } = await import("@jsquash/oxipng/codec/pkg/squoosh_oxipng.js");
  const { default: wasm } = await import(
    "@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url"
  );
  await initialise("oxipng", () => init(wasm));
  if (options.interlace) {
    // optimise() may retain the original if interlacing makes it larger.
    // Encoding decoded pixels honours an explicit interlacing request.
    return optimise_raw(
      pixels.data,
      pixels.width,
      pixels.height,
      Math.max(0, options.level),
      true,
      options.optimiseAlpha,
    ).buffer;
  }
  return optimise(
    new Uint8Array(buffer),
    Math.max(0, options.level),
    options.interlace,
    options.optimiseAlpha,
  ).buffer;
}
