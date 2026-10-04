import assert from "node:assert/strict";
import test from "node:test";
import { drawProcessed } from "./processImage.js";

globalThis.OffscreenCanvas = class {};
globalThis.ImageData = class {};
globalThis.Worker = class {};

function setup(t, respond = true) {
  const allocated = [];
  const events = [];
  let message;
  let terminated = false;
  t.mock.method(globalThis, "OffscreenCanvas", function (width, height) {
    const canvas = {
      width,
      height,
      getContext: () => ({
        drawImage: () => events.push("draw source"),
        getImageData: () => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData: () => events.push("write processed pixels"),
      }),
    };
    allocated.push({ width, height, canvas });
    return canvas;
  });
  t.mock.method(globalThis, "ImageData", function (data, width, height) {
    return { data, width, height };
  });
  t.mock.method(globalThis, "Worker", function () {
    return {
      postMessage(value) {
        message = value;
        events.push("process");
        if (respond)
          this.onmessage({
            data: {
              buffer: new ArrayBuffer(
                value.target.width * value.target.height * 4,
              ),
            },
          });
      },
      terminate() {
        terminated = true;
      },
    };
  });
  return {
    allocated,
    events,
    get message() {
      return message;
    },
    get terminated() {
      return terminated;
    },
  };
}

test("native sharpening allocates at output size and composites only processed pixels", async (t) => {
  const state = setup(t);
  await drawProcessed(
    { drawImage: () => state.events.push("composite") },
    { width: 10000, height: 10000, image: {} },
    { width: 10, height: 5 },
    { method: "auto", sharpen: true },
    new AbortController().signal,
  );
  assert.deepEqual(state.events, [
    "draw source",
    "process",
    "write processed pixels",
    "composite",
  ]);
  assert.equal(state.message.width, 10);
  assert.equal(state.message.height, 5);
  assert.equal(state.allocated[0].canvas.width, 0);
  assert.equal(state.terminated, true);
});

test("cancelling image processing releases its worker and temporary canvas", async (t) => {
  const state = setup(t, false);
  const controller = new AbortController();
  const pending = drawProcessed(
    {},
    { width: 20, height: 10, image: {} },
    { width: 10, height: 5 },
    { method: "lanczos3", sharpen: true },
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(state.message.width, 20);
  assert.equal(state.terminated, true);
  assert.equal(state.allocated[0].canvas.width, 0);
});
