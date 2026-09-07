import test from "node:test";
import assert from "node:assert/strict";
import { resizeImage } from "./resizeImage.js";

const source = { id: "1", file: { name: "image.png", size: 12 } };
const settings = {
  bounds: { width: 512, height: 512 },
  format: "jpeg",
  quality: 0.8,
  colours: 0,
  disableUpscale: true,
};

function installCanvas(
  t,
  encode = async () => new Blob(["jpeg"], { type: "image/jpeg" })
) {
  let closed = 0;
  let canvas;
  const calls = [];
  t.mock.method(globalThis, "createImageBitmap", async () => ({
    width: 20,
    height: 10,
    close() {
      closed++;
    },
  }));
  class FakeCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      canvas = this;
    }
    getContext() {
      return {
        fillRect() {
          calls.push("background");
        },
        drawImage() {
          calls.push("image");
        },
        getImageData() {
          return { data: new Uint8ClampedArray(20 * 10 * 4) };
        },
      };
    }
    convertToBlob() {
      return encode();
    }
  }
  t.mock.method(globalThis, "OffscreenCanvas", function (width, height) {
    return new FakeCanvas(width, height);
  });
  return {
    calls,
    get closed() {
      return closed;
    },
    get canvas() {
      return canvas;
    },
  };
}

// Node has no canvas APIs; these tests exercise ownership and cleanup contracts.
globalThis.createImageBitmap = () => {};
globalThis.OffscreenCanvas = class {};
globalThis.Worker = class {};

test("truncated worker output falls back to native PNG encoding", async (t) => {
  const state = installCanvas(
    t,
    async () => new Blob(["png"], { type: "image/png" })
  );
  let terminated = false;
  t.mock.method(globalThis, "Worker", function () {
    return {
      postMessage() {
        this.onmessage({ data: { fallback: true } });
      },
      terminate() {
        terminated = true;
      },
    };
  });
  const result = await resizeImage(
    source,
    { ...settings, format: "png" },
    new AbortController().signal
  );
  assert.equal(result.blob.type, "image/png");
  assert.equal(terminated, true);
  assert.equal(state.closed, 1);
});

test("JPEG flattening precedes drawing and native allocations are released", async (t) => {
  const state = installCanvas(t);
  const result = await resizeImage(
    source,
    settings,
    new AbortController().signal
  );
  assert.deepEqual(state.calls, ["background", "image"]);
  assert.equal(result.outputExtension, "jpg");
  assert.equal(state.closed, 1);
  assert.equal(state.canvas.width, 0);
  assert.equal(state.canvas.height, 0);
});

test("encoder fallback is rejected and resources are released", async (t) => {
  const state = installCanvas(
    t,
    async () => new Blob(["png"], { type: "image/png" })
  );
  await assert.rejects(
    resizeImage(source, settings, new AbortController().signal),
    /Could not encode/
  );
  assert.equal(state.closed, 1);
  assert.equal(state.canvas.width, 0);
});

test("cancellation during encoding suppresses output and releases resources", async (t) => {
  const controller = new AbortController();
  const state = installCanvas(t, async () => {
    controller.abort();
    return new Blob(["jpeg"], { type: "image/jpeg" });
  });
  await assert.rejects(resizeImage(source, settings, controller.signal), {
    name: "AbortError",
  });
  assert.equal(state.closed, 1);
  assert.equal(state.canvas.width, 0);
});

test("cancelling PNG encoding terminates the worker", async (t) => {
  const controller = new AbortController();
  const state = installCanvas(t);
  let terminated = false;
  class FakeWorker {
    postMessage() {
      controller.abort();
    }
    terminate() {
      terminated = true;
    }
  }
  t.mock.method(globalThis, "Worker", function () {
    return new FakeWorker();
  });
  await assert.rejects(
    resizeImage(source, { ...settings, format: "png" }, controller.signal),
    { name: "AbortError" }
  );
  assert.equal(terminated, true);
  assert.equal(state.closed, 1);
  assert.deepEqual(state.calls, ["image"]);
});

test("worker failures are reported and release both worker and bitmap", async (t) => {
  const state = installCanvas(t);
  let terminated = false;
  t.mock.method(globalThis, "Worker", function () {
    return {
      postMessage() {
        this.onerror();
      },
      terminate() {
        terminated = true;
      },
    };
  });
  await assert.rejects(
    resizeImage(
      source,
      { ...settings, format: "png" },
      new AbortController().signal
    ),
    /Could not encode.*PNG worker failed/
  );
  assert.equal(terminated, true);
  assert.equal(state.closed, 1);
});

test("cancellation while decoding closes the late bitmap without allocating canvas", async (t) => {
  const state = installCanvas(t);
  const controller = new AbortController();
  let release;
  let closed = false;
  t.mock.method(
    globalThis,
    "createImageBitmap",
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const work = resizeImage(source, settings, controller.signal);
  controller.abort();
  release({
    width: 10,
    height: 10,
    close() {
      closed = true;
    },
  });
  await assert.rejects(work, { name: "AbortError" });
  assert.equal(closed, true);
  assert.equal(state.canvas, undefined);
});
