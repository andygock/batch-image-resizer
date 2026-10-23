import assert from "node:assert/strict";
import test from "node:test";
import { unsupportedFeatures } from "./browserSupport.js";

test("startup reports missing APIs and accepts the supported feature set", () => {
  assert.ok(unsupportedFeatures({}).includes("OffscreenCanvas image encoding"));
  const environment = {
    Worker: class {},
    WebAssembly: { instantiate() {} },
    OffscreenCanvas: class {
      convertToBlob() {}
    },
    crypto: { randomUUID() {}, subtle: { digest() {} } },
    AbortSignal: class {
      throwIfAborted() {}
    },
    HTMLDialogElement: class {
      showModal() {}
    },
  };
  assert.deepEqual(unsupportedFeatures(environment), []);
  delete environment.crypto.subtle;
  assert.deepEqual(unsupportedFeatures(environment), [
    "secure-context cryptography",
  ]);
});
