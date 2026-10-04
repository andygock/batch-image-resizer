import assert from "node:assert/strict";
import test from "node:test";
import { processingKey, sanitiseProcessing } from "./processingSettings.js";
import { sharpenPixels } from "./sharpenPixels.js";

const options = { sharpen: true, amount: 1, radius: 1, threshold: 0 };
test("sharpening is optional, preserves solids and increases edge contrast", () => {
  const solid = new Uint8ClampedArray(
    Array(9).fill([80, 120, 160, 128]).flat(),
  );
  assert.deepEqual(sharpenPixels(solid, 3, 3, options), solid);
  const edge = new Uint8ClampedArray([80, 80, 80, 255, 160, 160, 160, 255]);
  assert.equal(sharpenPixels(edge, 2, 1, {}), edge);
  assert.equal(sharpenPixels(edge, 2, 1, { ...options, amount: 0 }), edge);
  const result = sharpenPixels(edge, 2, 1, options);
  assert.ok(result[0] < 80 && result[4] > 160);
  assert.deepEqual(
    sharpenPixels(edge, 2, 1, { ...options, threshold: 255 }),
    edge,
  );
});
test("sharpening preserves alpha and ignores colour in fully transparent pixels", () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 0, 0, 0, 120, 128, 0, 0, 120, 255,
  ]);
  assert.deepEqual(sharpenPixels(pixels, 3, 1, options), pixels);
  const vertical = new Uint8ClampedArray([80, 80, 80, 128, 160, 160, 160, 255]);
  const result = sharpenPixels(vertical, 1, 2, options);
  assert.ok(result[0] < 80 && result[4] > 160);
  assert.equal(result[3], 128);
  assert.equal(result[7], 255);
});
test("sharpening sanitises saved settings and affects cache keys only when active", () => {
  assert.deepEqual(
    processingKey({ ...options, sharpen: false }),
    processingKey({}),
  );
  assert.notDeepEqual(processingKey(options), processingKey({}));
  const value = sanitiseProcessing({
    sharpen: true,
    amount: Infinity,
    radius: 99,
    threshold: -2,
  });
  assert.equal(value.amount, 0.5);
  assert.equal(value.radius, 3);
  assert.equal(value.threshold, 0);
});
