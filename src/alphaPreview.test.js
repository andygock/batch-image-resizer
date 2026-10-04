import assert from "node:assert/strict";
import test from "node:test";
import { createAlphaPreview, showAlpha } from "./alphaPreview.js";

test("alpha inspection maps opacity to opaque greyscale regardless of hidden colour", () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 0, 80, 90, 100, 128, 0, 0, 0, 255,
  ]);
  assert.deepEqual(
    [...showAlpha(pixels)],
    [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255],
  );
});

globalThis.createImageBitmap = () => {};
globalThis.OffscreenCanvas = class {};

test("alpha preview uses display dimensions and releases native allocations", async (t) => {
  let closed = false;
  let canvas;
  let written;
  let dimensions;
  t.mock.method(globalThis, "createImageBitmap", async () => ({
    width: 200,
    height: 100,
    close() {
      closed = true;
    },
  }));
  t.mock.method(globalThis, "OffscreenCanvas", function (width, height) {
    dimensions = [width, height];
    canvas = {
      width,
      height,
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 128]) }),
        putImageData(image) {
          written = image.data;
        },
      }),
      convertToBlob: async ({ type }) => new Blob(["alpha"], { type }),
    };
    return canvas;
  });
  const input = new Blob(["original"], { type: "image/png" });
  const output = await createAlphaPreview(
    input,
    2,
    1,
    new AbortController().signal,
  );
  assert.deepEqual(dimensions, [2, 1]);
  assert.deepEqual([...written], [128, 128, 128, 255]);
  assert.equal(output.type, "image/png");
  assert.equal(await input.text(), "original");
  assert.equal(closed, true);
  assert.equal(canvas.width, 0);
});

test("alpha preview cancellation suppresses late output and releases resources", async (t) => {
  const controller = new AbortController();
  let closed = false;
  let canvas;
  t.mock.method(globalThis, "createImageBitmap", async () => ({
    width: 1,
    height: 1,
    close() {
      closed = true;
    },
  }));
  t.mock.method(globalThis, "OffscreenCanvas", function (width, height) {
    canvas = {
      width,
      height,
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData() {},
      }),
      convertToBlob: async () => {
        controller.abort();
        return new Blob();
      },
    };
    return canvas;
  });
  await assert.rejects(
    createAlphaPreview(new Blob(), 1, 1, controller.signal),
    { name: "AbortError" },
  );
  assert.equal(closed, true);
  assert.equal(canvas.width, 0);
});
