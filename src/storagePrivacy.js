import { PREFERENCES_STORAGE_KEY } from "./preferences.js";

const PREFIX = "batch-image-resizer:";
export const STORAGE_POLICY_KEY = `${PREFIX}storage-policy:v1`;
export const STORAGE_CHANNEL = `${PREFIX}storage-events`;

export function readStoragePolicy() {
  try {
    const value = JSON.parse(
      globalThis.localStorage.getItem(STORAGE_POLICY_KEY) || "null",
    );
    return {
      rememberPreferences: value?.rememberPreferences !== false,
      rememberBatch: value?.rememberBatch !== false,
    };
  } catch {
    return { rememberPreferences: true, rememberBatch: true };
  }
}

export function writeStoragePolicy(policy) {
  globalThis.localStorage.setItem(
    STORAGE_POLICY_KEY,
    JSON.stringify({
      rememberPreferences: policy.rememberPreferences,
      rememberBatch: policy.rememberBatch,
    }),
  );
}

export function clearAppLocalStorage() {
  // Same-origin applications share storage; remove only keys we own explicitly.
  for (const key of [PREFERENCES_STORAGE_KEY, STORAGE_POLICY_KEY])
    globalThis.localStorage.removeItem(key);
}
