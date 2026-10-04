// Keep stored preferences, modal validation and encoder inputs on one schema.
const select = (label, value, options, hint = "", when) => ({
  label,
  value,
  options,
  hint,
  when,
  type: "select",
});
const number = (label, value, min, max, hint = "", when) => ({
  label,
  value,
  min,
  max,
  hint,
  when,
  type: "number",
});
const toggle = (label, value, hint = "", when) => ({
  label,
  value,
  hint,
  when,
  type: "checkbox",
});
const lossy = (s) => s.mode === "lossy";
const colourJpeg = (s) => !s.greyscale;

export const ADVANCED_FIELDS = {
  avif: {
    speed: number(
      "Encoding speed",
      6,
      0,
      10,
      "0 is slowest and most thorough; 10 is fastest. AVIF can take substantially longer to encode.",
    ),
    alphaQuality: number(
      "Transparency quality",
      100,
      0,
      100,
      "100 preserves transparency values.",
    ),
    subsampling: select("Chroma subsampling", 1, [
      [1, "4:2:0 · smaller files"],
      [2, "4:2:2"],
      [3, "4:4:4 · full colour detail"],
    ]),
    tune: select("Quality tuning", 0, [
      [0, "Automatic"],
      [1, "PSNR"],
      [2, "SSIM"],
    ]),
    denoise: number(
      "Denoising strength",
      0,
      0,
      50,
      "0 disables noise removal; higher settings can remove fine detail.",
    ),
    sharpness: number(
      "Codec sharpness",
      0,
      0,
      7,
      "Controls the encoder's filtering, independently of image sharpening.",
    ),
    sharpYuv: toggle("Sharper colour conversion", false),
  },
  webp: {
    encoder: select("Encoder", "browser", [
      ["browser", "Browser · fast"],
      ["advanced", "Advanced · libwebp"],
    ]),
    mode: select(
      "Compression mode",
      "lossy",
      [
        ["lossy", "Lossy"],
        ["lossless", "Lossless"],
        ["near-lossless", "Near-lossless"],
      ],
      "Lossless preserves the resized pixels, not the original dimensions.",
    ),
    method: select(
      "Encoding effort",
      4,
      [
        [0, "0 · fastest"],
        [1, "1"],
        [2, "2 · fast"],
        [3, "3"],
        [4, "4 · balanced"],
        [5, "5"],
        [6, "6 · best compression"],
      ],
      "Higher effort takes longer and can reduce file size.",
    ),
    losslessQuality: number(
      "Lossless compression effort",
      75,
      0,
      100,
      "Higher values spend more time compressing; they do not change pixel quality.",
      (s) => !lossy(s),
    ),
    nearLossless: number(
      "Near-lossless fidelity",
      60,
      0,
      100,
      "100 preserves pixels; lower values allow more changes before lossless encoding.",
      (s) => s.mode === "near-lossless",
    ),
    imageHint: select(
      "Image hint",
      0,
      [
        [0, "Default"],
        [1, "Picture"],
        [2, "Photo"],
        [3, "Graph / artwork"],
      ],
      "Guides the lossless encoder.",
      (s) => !lossy(s),
    ),
    alphaQuality: number(
      "Transparency quality",
      100,
      0,
      100,
      "100 keeps the alpha channel lossless.",
      lossy,
    ),
    alphaFiltering: select(
      "Transparency filtering",
      1,
      [
        [0, "None"],
        [1, "Fast"],
        [2, "Best"],
      ],
      "Filtering effort for the alpha channel.",
      lossy,
    ),
    exact: toggle(
      "Preserve RGB beneath fully transparent pixels",
      false,
      "Useful for editing workflows; may increase size.",
      (s) => !lossy(s),
    ),
    sharpYuv: toggle(
      "Sharper colour conversion",
      false,
      "Can improve coloured edges; takes longer.",
      lossy,
    ),
    sns: number(
      "Spatial noise shaping",
      50,
      0,
      100,
      "Redistributes bits to retain visually important detail.",
      lossy,
    ),
    filterStrength: number(
      "Deblocking strength",
      60,
      0,
      100,
      "Higher values smooth block boundaries more strongly.",
      (s) => lossy(s) && !s.autofilter,
    ),
    filterSharpness: number(
      "Deblocking sharpness",
      0,
      0,
      7,
      "Higher values retain sharper edges.",
      lossy,
    ),
    autofilter: toggle(
      "Automatically adjust deblocking",
      false,
      "Let the encoder choose the filter strength.",
      lossy,
    ),
    passes: number(
      "Analysis passes",
      1,
      1,
      10,
      "Extra passes can improve size targeting at the cost of time.",
      lossy,
    ),
    targetSizeKB: number(
      "Target file size (KB)",
      0,
      0,
      100000,
      "0 disables targeting. Best effort: overrides quality and is not a strict size limit. Uses at least six analysis passes.",
      lossy,
    ),
    lowMemory: toggle(
      "Use less encoder memory",
      false,
      "May encode more slowly.",
      lossy,
    ),
  },
  jpeg: {
    encoder: select("Encoder", "browser", [
      ["browser", "Browser · fast"],
      ["advanced", "Advanced · MozJPEG"],
    ]),
    background: {
      label: "Transparency background",
      value: "#ffffff",
      type: "color",
      hint: "Transparent areas are flattened onto this colour with either encoder.",
    },
    progressive: toggle(
      "Progressive JPEG",
      true,
      "Displays in increasingly detailed passes during download.",
    ),
    optimiseCoding: toggle(
      "Optimise entropy coding",
      true,
      "Find more compact coding without changing image quality.",
      (s) => !s.progressive,
    ),
    greyscale: toggle("Greyscale output", false, "Discard colour information."),
    subsampling: select(
      "Chroma subsampling",
      "auto",
      [
        ["auto", "Automatic"],
        ["444", "4:4:4 · full colour detail"],
        ["420", "4:2:0 · smaller files"],
      ],
      "Full colour detail is useful for text and sharp coloured edges.",
      colourJpeg,
    ),
    separateChroma: toggle(
      "Separate chroma quality",
      false,
      "Tune colour quality independently of the main quality setting.",
      colourJpeg,
    ),
    chromaQuality: number(
      "Chroma quality",
      80,
      0,
      100,
      "Quality of the colour channels.",
      (s) => colourJpeg(s) && s.separateChroma,
    ),
    smoothing: number(
      "Input smoothing",
      0,
      0,
      100,
      "0 disables smoothing. Higher values remove detail before compression.",
    ),
    quantTable: select(
      "Quantisation table",
      3,
      [
        [0, "JPEG Annex K"],
        [1, "Flat"],
        [2, "MS-SSIM"],
        [3, "ImageMagick"],
        [4, "PSNR-HVS"],
        [5, "Klein–Silverstein–Carney"],
        [6, "Watson–Taylor–Borthwick"],
        [7, "Ahumada–Watson–Peterson"],
        [8, "Peterson–Ahumada–Watson"],
      ],
      "Advanced trade-offs between detail and compression; compare at 100%.",
    ),
    trellisMultipass: toggle(
      "Multi-pass trellis optimisation",
      false,
      "Spend extra time choosing more efficient coefficients.",
    ),
    trellisOptZero: toggle("Optimise zero coefficient blocks", false),
    trellisOptTable: toggle("Optimise quantisation table", false),
    trellisLoops: number(
      "Trellis optimisation loops",
      1,
      1,
      10,
      "More loops take longer.",
    ),
  },
  png: {
    dither: number(
      "Dithering strength (%)",
      0,
      0,
      100,
      "0 disables dithering. Riemersma dithering reduces palette banding but can increase file size. Only applies with a reduced palette.",
    ),
    level: select(
      "Compression effort",
      -1,
      [
        [-1, "Standard"],
        [0, "0 · fast optimisation"],
        [1, "1"],
        [2, "2 · balanced"],
        [3, "3"],
        [4, "4 · thorough"],
        [5, "5"],
        [6, "6 · maximum effort"],
      ],
      "Lossless optimisation after palette reduction; higher levels can be substantially slower.",
    ),
    interlace: toggle(
      "Interlaced PNG",
      false,
      "Displays progressively while loading; may increase size.",
    ),
    optimiseAlpha: toggle(
      "Optimise invisible RGB values",
      false,
      "Can change RGB values under fully transparent pixels to reduce size. Visible pixels are unchanged.",
    ),
  },
};

export function sanitiseAdvanced(value) {
  return Object.fromEntries(
    Object.entries(ADVANCED_FIELDS).map(([format, fields]) => [
      format,
      Object.fromEntries(
        Object.entries(fields).map(([key, field]) => {
          const input = value?.[format]?.[key];
          return [key, validAdvancedValue(field, input) ? input : field.value];
        }),
      ),
    ]),
  );
}

export function validAdvancedValue(field, value) {
  if (field.type === "checkbox") return typeof value === "boolean";
  if (field.type === "color")
    return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
  if (field.type === "select")
    return field.options.some(([option]) => option === value);
  return Number.isInteger(value) && value >= field.min && value <= field.max;
}

export const DEFAULT_ADVANCED = sanitiseAdvanced();

export function effectiveAdvanced(settings) {
  const format = settings.format;
  const all = sanitiseAdvanced(settings.advanced);
  const options = all[format];
  if (!options) return {};
  if (options.encoder === "browser")
    return format === "jpeg"
      ? { encoder: "browser", background: options.background }
      : { encoder: "browser" };
  return Object.fromEntries(
    Object.entries(options).filter(([key]) => {
      if (format === "png" && key === "dither" && !settings.colours)
        return false;
      return (
        !ADVANCED_FIELDS[format][key].when ||
        ADVANCED_FIELDS[format][key].when(options)
      );
    }),
  );
}

export function webpOptions(settings) {
  const s = sanitiseAdvanced(settings.advanced).webp;
  const lossless = s.mode !== "lossy";
  return {
    quality: lossless
      ? s.losslessQuality
      : s.targetSizeKB > 0
        ? 75
        : Math.round(settings.quality * 100),
    lossless: Number(lossless),
    near_lossless: s.mode === "near-lossless" ? s.nearLossless : 100,
    method: s.method,
    image_hint: lossless ? s.imageHint : 0,
    alpha_quality: lossless ? 100 : s.alphaQuality,
    alpha_filtering: s.alphaFiltering,
    exact: Number(lossless && s.exact),
    use_sharp_yuv: Number(!lossless && s.sharpYuv),
    sns_strength: s.sns,
    filter_strength: s.filterStrength,
    filter_sharpness: s.filterSharpness,
    autofilter: Number(s.autofilter),
    pass: !lossless && s.targetSizeKB ? Math.max(6, s.passes) : s.passes,
    target_size: lossless ? 0 : s.targetSizeKB * 1000,
    low_memory: Number(!lossless && s.lowMemory),
  };
}

export function jpegOptions(settings) {
  const s = sanitiseAdvanced(settings.advanced).jpeg;
  return {
    quality: Math.round(settings.quality * 100),
    progressive: s.progressive,
    optimize_coding: s.optimiseCoding,
    color_space: s.greyscale ? 1 : 3,
    auto_subsample: s.subsampling === "auto",
    // This binding uses the same horizontal and vertical sampling factor.
    chroma_subsample: { auto: 2, 444: 1, 420: 2 }[s.subsampling],
    separate_chroma_quality: !s.greyscale && s.separateChroma,
    chroma_quality: s.chromaQuality,
    smoothing: s.smoothing,
    quant_table: s.quantTable,
    trellis_multipass: s.trellisMultipass,
    trellis_opt_zero: s.trellisOptZero,
    trellis_opt_table: s.trellisOptTable,
    trellis_loops: s.trellisLoops,
  };
}
