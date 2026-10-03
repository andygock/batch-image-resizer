import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  clearPreferences,
  loadPreferences,
  sanitisePreferences,
  savePreferences,
} from "./preferences.js";

function withLocalStorage(storage, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else delete globalThis.localStorage;
    });
}

test("preferences sanitisation validates sizes, options, and unique recents", () => {
  const preferences = sanitisePreferences({
    boundingBox: { width: 9000, height: 1 },
    outputFormat: "gif",
    qualityByFormat: { jpeg: 1.2, webp: 0.5 },
    pngColors: 16,
    suffix: "x".repeat(140),
    viewMode: "tiles",
    recentSizes: [
      { width: 300, height: 200 },
      { width: 300, height: 200 },
      { width: 0, height: 5 },
      ...Array.from({ length: 7 }, (_, index) => ({
        width: 400 + index,
        height: 300,
      })),
    ],
  });

  assert.deepEqual(preferences.boundingBox, DEFAULT_PREFERENCES.boundingBox);
  assert.equal(preferences.outputFormat, "source");
  assert.deepEqual(preferences.qualityByFormat, { jpeg: 0.8, webp: 0.5 });
  assert.equal(preferences.pngColors, 0);
  assert.equal(preferences.suffix.length, 100);
  assert.equal(preferences.viewMode, "grid");
  assert.deepEqual(preferences.recentSizes, [
    { width: 300, height: 200 },
    { width: 400, height: 300 },
    { width: 401, height: 300 },
    { width: 402, height: 300 },
    { width: 403, height: 300 },
    { width: 404, height: 300 },
  ]);
});

test("preferences read and write only the app's versioned storage key", async () => {
  await withLocalStorage(
    {
      values: new Map([["other-app", "keep"]]),
      getItem(key) {
        return this.values.get(key) ?? null;
      },
      setItem(key, value) {
        this.values.set(key, value);
      },
      removeItem(key) {
        this.values.delete(key);
      },
    },
    async () => {
      const saved = savePreferences({ outputFormat: "webp", suffix: "_tiny" });
      assert.equal(saved.outputFormat, "webp");
      assert.equal(loadPreferences().suffix, "_tiny");
      assert.ok(globalThis.localStorage.values.has(PREFERENCES_STORAGE_KEY));
      clearPreferences();
      assert.deepEqual(
        [...globalThis.localStorage.values],
        [["other-app", "keep"]],
      );
    },
  );
});

test("denied or malformed local storage loads defaults and write failures are exposed", async () => {
  await withLocalStorage(
    {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
    },
    () => {
      assert.deepEqual(
        loadPreferences(),
        sanitisePreferences(DEFAULT_PREFERENCES),
      );
      assert.throws(
        () => savePreferences(DEFAULT_PREFERENCES),
        /Could not save preferences: denied/,
      );
      assert.throws(() => clearPreferences(), /Could not clear preferences:/);
    },
  );
  await withLocalStorage(
    {
      getItem() {
        return "{";
      },
      setItem() {},
      removeItem() {},
    },
    () =>
      assert.deepEqual(
        loadPreferences(),
        sanitisePreferences(DEFAULT_PREFERENCES),
      ),
  );
});
