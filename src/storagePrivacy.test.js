import test from "node:test";
import assert from "node:assert/strict";
import {
  clearAppLocalStorage,
  readStoragePolicy,
  writeStoragePolicy,
} from "./storagePrivacy.js";

test("storage clearing removes only known app keys and preserves unrecognised keys", (t) => {
  const values = new Map([
    ["batch-image-resizer:old:v0", "old"],
    ["batch-image-resizer:preferences:v1", "settings"],
    ["another-app", "keep"],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index],
    removeItem: (key) => values.delete(key),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  });
  writeStoragePolicy({ rememberPreferences: false, rememberBatch: false });
  assert.deepEqual(readStoragePolicy(), {
    rememberPreferences: false,
    rememberBatch: false,
  });
  clearAppLocalStorage();
  assert.deepEqual([...values], [
    ["batch-image-resizer:old:v0", "old"],
    ["another-app", "keep"],
  ]);
});
