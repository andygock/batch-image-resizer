import assert from "node:assert/strict";
import test from "node:test";
import { decodeImage } from "./decodeImage.js";

globalThis.createImageBitmap = () => {};
globalThis.Image = class {};
const file = new File(["image bytes"], "image.png", { type: "image/png" });

function installFallback(t, outcome = "load") {
  let image;
  const revoked = [];
  const revoke = URL.revokeObjectURL;
  t.mock.method(URL, "revokeObjectURL", (url) => {
    revoked.push(url);
    revoke(url);
  });
  t.mock.method(globalThis, "createImageBitmap", async () => {
    throw new DOMException(
      "The image could not be decoded",
      "InvalidStateError",
    );
  });
  t.mock.method(globalThis, "Image", function () {
    image = {
      naturalWidth: 30,
      naturalHeight: 15,
      set src(url) {
        this.url = url;
        if (outcome !== "pending")
          queueMicrotask(() => {
            if (outcome === "load") this.onload?.();
            else this.onerror?.();
          });
      },
      removeAttribute(name) {
        assert.equal(name, "src");
        this.removed = true;
      },
    };
    return image;
  });
  return {
    revoked,
    get image() {
      return image;
    },
  };
}

test("a transient bitmap failure retries automatically without loading an image element", async (t) => {
  let calls = 0;
  let closed = 0;
  const bitmap = { width: 20, height: 10, close: () => closed++ };
  t.mock.method(globalThis, "createImageBitmap", async (input) => {
    assert.equal(input, file);
    if (++calls === 1) throw new Error("Temporary decoding failure");
    return bitmap;
  });
  t.mock.method(globalThis, "Image", function () {
    assert.fail("The successful bitmap retry needs no fallback");
  });
  const result = await decodeImage(file, new AbortController().signal);
  assert.equal(calls, 2);
  assert.equal(result.image, bitmap);
  assert.equal(result.width, 20);
  assert.equal(result.height, 10);
  result.close();
  assert.equal(closed, 1);
});

test("persistent bitmap failures fall back to an image element with explicit cleanup", async (t) => {
  const state = installFallback(t);
  const result = await decodeImage(file, new AbortController().signal);
  assert.equal(globalThis.createImageBitmap.mock.callCount(), 2);
  assert.equal(result.image, state.image);
  assert.equal(result.width, 30);
  assert.equal(result.height, 15);
  assert.equal(state.revoked.length, 0);
  result.close();
  result.close();
  assert.equal(state.image.removed, true);
  assert.deepEqual(state.revoked, [state.image.url]);
  assert.equal(state.image.onload, null);
  assert.equal(state.image.onerror, null);
});

test("failure after all recovery attempts cleans up the fallback URL", async (t) => {
  const state = installFallback(t, "error");
  await assert.rejects(
    decodeImage(file, new AbortController().signal),
    /Automatic decoding recovery failed:.*could not be decoded.*could not be loaded/,
  );
  assert.equal(globalThis.createImageBitmap.mock.callCount(), 2);
  assert.equal(state.image.removed, true);
  assert.deepEqual(state.revoked, [state.image.url]);
});

test("cancelling fallback loading rejects promptly and prevents late load callbacks", async (t) => {
  const state = installFallback(t, "pending");
  const controller = new AbortController();
  const pending = decodeImage(file, controller.signal);
  for (let attempt = 0; attempt < 5 && !state.image; attempt++)
    await Promise.resolve();
  assert.ok(state.image);
  const loaded = state.image.onload;
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  loaded();
  assert.equal(state.image.removed, true);
  assert.deepEqual(state.revoked, [state.image.url]);
});

test("cancelling the first bitmap attempt does not start recovery", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "createImageBitmap", async () => {
    controller.abort();
    throw new Error("Decoding failed");
  });
  t.mock.method(globalThis, "Image", function () {
    assert.fail("Cancelled decoding must not start a fallback");
  });
  await assert.rejects(decodeImage(file, controller.signal), {
    name: "AbortError",
  });
  assert.equal(globalThis.createImageBitmap.mock.callCount(), 1);
});
