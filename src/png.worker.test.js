import test from "node:test";
import assert from "node:assert/strict";
import UPNG from "upng-js";

test("PNG worker encodes lossless pixels with transparency", async () => {
  let response;
  globalThis.self = {
    postMessage(value) {
      response = value;
    },
  };
  try {
    await import("./png.worker.js");
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]);
    self.onmessage({
      data: { buffer: pixels.buffer, width: 2, height: 1, colours: 0 },
    });
    assert.equal(response.error, undefined);
    const decoded = UPNG.decode(response.buffer);
    assert.equal(decoded.width, 2);
    assert.equal(decoded.height, 1);
    assert.deepEqual(new Uint8Array(UPNG.toRGBA8(decoded)[0]), pixels);
  } finally {
    delete globalThis.self;
  }
});
