import assert from "node:assert/strict";
import test from "node:test";
import { decodeAvifImage } from "./decodeAvifImage.js";

globalThis.Worker = class {};
globalThis.OffscreenCanvas = class {};
globalThis.ImageData = class {};
const file = new File(["avif"], "image.avif", { type: "image/avif" });

test("fallback AVIF decoding transfers pixels and releases resources", async (t) => {
  let terminated = false;
  let drawn;
  t.mock.method(globalThis, "ImageData", function (data, width, height) {
    return { data, width, height };
  });
  t.mock.method(globalThis, "OffscreenCanvas", function (width, height) {
    return {
      width,
      height,
      getContext: () => ({
        putImageData(pixels) {
          drawn = pixels;
        },
      }),
    };
  });
  t.mock.method(globalThis, "Worker", function () {
    return {
      postMessage({ buffer }, transfer) {
        assert.equal(transfer[0], buffer);
        this.onmessage({
          data: { buffer: new ArrayBuffer(24), width: 3, height: 2 },
        });
      },
      terminate() {
        terminated = true;
      },
    };
  });
  const decoded = await decodeAvifImage(file, new AbortController().signal);
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 2);
  assert.equal(drawn.data.length, 24);
  assert.equal(terminated, true);
  decoded.close();
  assert.equal(decoded.image.width, 0);
});

test("cancellation terminates the AVIF fallback decoder", async (t) => {
  const controller = new AbortController();
  let terminated = false;
  t.mock.method(globalThis, "Worker", function () {
    return {
      postMessage() {
        controller.abort();
      },
      terminate() {
        terminated = true;
      },
    };
  });
  await assert.rejects(decodeAvifImage(file, controller.signal), {
    name: "AbortError",
  });
  assert.equal(terminated, true);
});
