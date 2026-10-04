import { DEFAULT_ADVANCED, sanitiseAdvanced } from "./advancedSettings.js";
import { validateSize } from "./imageUtils.js";
import {
  DEFAULT_PROCESSING,
  sanitiseProcessing,
} from "./processingSettings.js";

export const PREFERENCES_STORAGE_KEY = "batch-image-resizer:preferences:v1";

export const DEFAULT_PREFERENCES = Object.freeze({
  boundingBox: Object.freeze({ width: 512, height: 512 }),
  outputFormat: "source",
  qualityByFormat: Object.freeze({ jpeg: 0.8, webp: 0.8, avif: 0.5 }),
  pngColors: 0,
  advanced: DEFAULT_ADVANCED,
  processing: DEFAULT_PROCESSING,
  enableSuffix: true,
  suffix: "_small",
  disableUpscale: true,
  recentSizes: Object.freeze([]),
  viewMode: "grid",
  rememberPreferences: true,
});

const OUTPUT_FORMATS = new Set(["source", "jpeg", "png", "webp", "avif"]);
const VIEW_MODES = new Set(["grid", "list"]);
const PNG_COLOURS = new Set([0, 256, 128, 64, 32, 16, 8, 4, 2]);
const MAX_SUFFIX_LENGTH = 100;
const MAX_RECENT_SIZES = 6;

function isValidSize(value) {
  if (!value || typeof value !== "object") return false;
  try {
    validateSize(value);
    return true;
  } catch {
    return false;
  }
}

function cleanRecentSizes(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const sizes = [];
  for (const size of value) {
    if (!isValidSize(size)) continue;
    const key = `${size.width}x${size.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sizes.push({ width: size.width, height: size.height });
    if (sizes.length === MAX_RECENT_SIZES) break;
  }
  return sizes;
}

export function sanitisePreferences(value) {
  const input = value && typeof value === "object" ? value : {};
  const boundingBox = isValidSize(input.boundingBox)
    ? { width: input.boundingBox.width, height: input.boundingBox.height }
    : { ...DEFAULT_PREFERENCES.boundingBox };
  const quality =
    input.qualityByFormat && typeof input.qualityByFormat === "object"
      ? input.qualityByFormat
      : {};

  return {
    advanced: sanitiseAdvanced(input.advanced),
    processing: sanitiseProcessing(input.processing),
    boundingBox,
    outputFormat: OUTPUT_FORMATS.has(input.outputFormat)
      ? input.outputFormat
      : DEFAULT_PREFERENCES.outputFormat,
    qualityByFormat: {
      jpeg: validQuality(quality.jpeg) ? quality.jpeg : 0.8,
      webp: validQuality(quality.webp) ? quality.webp : 0.8,
      avif: validQuality(quality.avif, 0) ? quality.avif : 0.5,
    },
    pngColors: PNG_COLOURS.has(input.pngColors) ? input.pngColors : 0,
    enableSuffix:
      typeof input.enableSuffix === "boolean"
        ? input.enableSuffix
        : DEFAULT_PREFERENCES.enableSuffix,
    suffix:
      typeof input.suffix === "string"
        ? input.suffix.slice(0, MAX_SUFFIX_LENGTH)
        : DEFAULT_PREFERENCES.suffix,
    disableUpscale:
      typeof input.disableUpscale === "boolean"
        ? input.disableUpscale
        : DEFAULT_PREFERENCES.disableUpscale,
    recentSizes: cleanRecentSizes(input.recentSizes),
    viewMode: VIEW_MODES.has(input.viewMode)
      ? input.viewMode
      : DEFAULT_PREFERENCES.viewMode,
    rememberPreferences:
      typeof input.rememberPreferences === "boolean"
        ? input.rememberPreferences
        : DEFAULT_PREFERENCES.rememberPreferences,
  };
}

function validQuality(value, min = 0.3) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= 1
  );
}

export function loadPreferences() {
  try {
    const stored = globalThis.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!stored) return sanitisePreferences(DEFAULT_PREFERENCES);
    return sanitisePreferences(JSON.parse(stored));
  } catch {
    // Storage can be disabled or contain data from an older or damaged version.
    return sanitisePreferences(DEFAULT_PREFERENCES);
  }
}

export function savePreferences(value) {
  const clean = sanitisePreferences(value);
  try {
    globalThis.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify(
        clean.rememberPreferences ? clean : { rememberPreferences: false },
      ),
    );
    return clean;
  } catch (error) {
    throw new Error(
      `Could not save preferences: ${error?.message || "storage is unavailable"}`,
      {
        cause: error,
      },
    );
  }
}

export function clearPreferences() {
  try {
    globalThis.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  } catch (error) {
    throw new Error(
      `Could not clear preferences: ${error?.message || "storage is unavailable"}`,
      {
        cause: error,
      },
    );
  }
}
