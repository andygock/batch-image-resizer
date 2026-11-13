export const DEFAULT_PROCESSING = Object.freeze({
  method: "auto",
  linearRGB: true,
  premultiply: true,
  sharpen: false,
  amount: 0.5,
  radius: 1,
  threshold: 2,
});

export const SHARPENING_FIELDS = [
  { key: "amount", label: "Sharpening amount", min: 0, max: 2, step: 0.1 },
  {
    key: "radius",
    label: "Radius (output pixels)",
    min: 0.3,
    max: 3,
    step: 0.1,
  },
  { key: "threshold", label: "Threshold (0–255)", min: 0, max: 255, step: 1 },
];

export function validProcessingField(field, value) {
  const steps = (value - field.min) / field.step;
  return (
    Number.isFinite(value) &&
    value >= field.min &&
    value <= field.max &&
    Math.abs(steps - Math.round(steps)) < 1e-6
  );
}

export function validProcessingDraft(value) {
  return (
    !value?.sharpen ||
    SHARPENING_FIELDS.every((field) =>
      validProcessingField(field, value[field.key]),
    )
  );
}

function bounded(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

export function sanitiseProcessing(value) {
  return {
    method: ["auto", "lanczos3", "mitchell", "nearest"].includes(value?.method)
      ? value.method
      : "auto",
    linearRGB: typeof value?.linearRGB === "boolean" ? value.linearRGB : true,
    premultiply:
      typeof value?.premultiply === "boolean" ? value.premultiply : true,
    sharpen: value?.sharpen === true,
    amount: bounded(value?.amount, 0.5, 0, 2),
    radius: bounded(value?.radius, 1, 0.3, 3),
    threshold: Math.round(bounded(value?.threshold, 2, 0, 255)),
  };
}

export function processingKey(value) {
  const options = sanitiseProcessing(value);
  const key =
    options.method === "auto" || options.method === "nearest"
      ? { method: options.method }
      : {
          method: options.method,
          linearRGB: options.linearRGB,
          premultiply: options.premultiply,
        };
  return options.sharpen && options.amount > 0
    ? {
        ...key,
        sharpen: true,
        amount: options.amount,
        radius: options.radius,
        threshold: options.threshold,
      }
    : key;
}
