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

export function clearAppWebStorage(kind) {
  const storage =
    kind === "session" ? globalThis.sessionStorage : globalThis.localStorage;
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  );
  for (const key of keys) if (key?.startsWith(PREFIX)) storage.removeItem(key);
}
