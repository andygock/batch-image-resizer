import { sanitiseAdvanced } from "./advancedSettings.js";

export async function encodeAvif(pixels, settings) {
  const [{ default: factory }, { default: wasm }, { defaultOptions }] =
    await Promise.all([
      import("@jsquash/avif/codec/enc/avif_enc.js"),
      import("@jsquash/avif/codec/enc/avif_enc.wasm?url"),
      import("@jsquash/avif/meta.js"),
    ]);
  // One encoder thread per cancellable worker avoids host isolation requirements.
  const codec = await factory({ noInitialRun: true, locateFile: () => wasm });
  const options = sanitiseAdvanced(settings.advanced).avif;
  const result = codec.encode(pixels.data, pixels.width, pixels.height, {
    ...defaultOptions,
    quality: Math.round(settings.quality * 100),
    qualityAlpha: options.alphaQuality,
    speed: options.speed,
    subsample: options.subsampling,
    tune: options.tune,
    denoiseLevel: options.denoise,
    sharpness: options.sharpness,
    enableSharpYUV: options.sharpYuv,
  });
  if (!result?.byteLength) throw new Error("AVIF encoding failed.");
  return result.buffer;
}

export async function decodeAvif(buffer) {
  const [{ default: decode, init }, { default: wasm }] = await Promise.all([
    import("@jsquash/avif/decode.js"),
    import("@jsquash/avif/codec/dec/avif_dec.wasm?url"),
  ]);
  await init({ locateFile: () => wasm });
  return decode(buffer, { bitDepth: 8 });
}
