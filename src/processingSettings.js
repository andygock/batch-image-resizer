export const DEFAULT_PROCESSING = Object.freeze({
  method: "auto",
  linearRGB: true,
  premultiply: true,
});

export function sanitiseProcessing(value) {
  return {
    method: ["auto", "lanczos3", "mitchell", "nearest"].includes(value?.method)
      ? value.method
      : "auto",
    linearRGB: typeof value?.linearRGB === "boolean" ? value.linearRGB : true,
    premultiply:
      typeof value?.premultiply === "boolean" ? value.premultiply : true,
  };
}

export function processingKey(value) {
  const options = sanitiseProcessing(value);
  return options.method === "auto" || options.method === "nearest"
    ? { method: options.method }
    : options;
}
