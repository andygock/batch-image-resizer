import assert from "node:assert/strict";
import test from "node:test";
import { processingKey, sanitiseProcessing } from "./processingSettings.js";
import { resamplePixels } from "./resamplePixels.js";

test("resampling preserves solid RGBA across both pass orders", () => {
  for (const method of ["lanczos3", "mitchell", "nearest"])
    for (const [w, h] of [
      [2, 7],
      [7, 2],
    ]) {
      const input = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < input.length; i += 4)
        input.set([50, 100, 200, 128], i);
      const result = resamplePixels(input, 4, 4, w, h, {
        method,
        linearRGB: true,
        premultiply: true,
      });
      for (let i = 0; i < result.length; i += 4)
        assert.deepEqual([...result.slice(i, i + 4)], [50, 100, 200, 128]);
    }
});
test("linear-light averaging preserves brightness and alpha weighting prevents fringes", () => {
  const options = { method: "mitchell", linearRGB: true, premultiply: true };
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  assert.ok(resamplePixels(pixels, 2, 1, 1, 1, options)[0] > 180);
  assert.equal(
    resamplePixels(pixels, 2, 1, 1, 1, { ...options, linearRGB: false })[0],
    128,
  );
  const alpha = resamplePixels(
    new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 255]),
    2,
    1,
    1,
    1,
    options,
  );
  assert.deepEqual([...alpha], [0, 0, 255, 128]);
});
test("nearest-neighbour produces exact pixel blocks and processing keys ignore inactive controls", () => {
  const input = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
  assert.deepEqual(
    [...resamplePixels(input, 2, 1, 4, 1, { method: "nearest" })],
    [255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255],
  );
  assert.deepEqual(processingKey({ method: "auto", linearRGB: false }), {
    method: "auto",
  });
  assert.equal(sanitiseProcessing({ method: "invalid" }).method, "auto");
});
