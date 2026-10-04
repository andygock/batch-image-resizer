import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import UPNG from "upng-js";
import { sanitiseAdvanced } from "../src/advancedSettings.js";

// Execute the emitted worker modules and lazy chunks directly in Node. This
// catches bundler/asset-link failures that source-level codec tests cannot.
const assets = new URL("../dist/assets/", import.meta.url);
const files = await readdir(assets);
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url) => {
  const target = new URL(url);
  assert.ok(
    target.href.startsWith(assets.href) && target.pathname.endsWith(".wasm"),
    "Built codecs must load only bundled local WASM assets",
  );
  return new Response(await readFile(target), {
    headers: { "Content-Type": "application/wasm" },
  });
};
test.after(() => {
  globalThis.fetch = fetchOriginal;
  delete globalThis.self;
});

const data = new Uint8ClampedArray(32 * 32 * 4);
for (let i = 0; i < data.length; i += 4) {
  data[i] = (i / 4) % 256;
  data[i + 1] = 100;
  data[i + 2] = 200;
  data[i + 3] = i % 3 ? 255 : 128;
}

async function runWorker(prefix, messages) {
  const file = files.find(
    (file) => file.startsWith(`${prefix}-`) && file.endsWith(".js"),
  );
  assert.ok(file, `Build contains ${prefix}`);
  const url = new URL(file, assets);
  let response;
  globalThis.self = {
    location: { href: url.href },
    postMessage(value) {
      response = value;
    },
  };
  await import(url.href);
  const outputs = [];
  for (const message of messages) {
    response = undefined;
    await self.onmessage({
      data: { buffer: data.slice().buffer, width: 32, height: 32, ...message },
    });
    assert.ok(response, "Worker posted a response");
    assert.equal(response.error, undefined);
    assert.ok(response.buffer?.byteLength > 0);
    outputs.push(response.buffer);
  }
  return outputs;
}

test("built PNG worker loads dithering, optimiser and interlacing chunks", async () => {
  const [buffer] = await runWorker("png.worker", [
    {
      colours: 4,
      advanced: sanitiseAdvanced({
        png: { dither: 75, level: 2, interlace: true },
      }),
    },
  ]);
  assert.equal(new Uint8Array(buffer)[28], 1);
  const decoded = UPNG.decode(buffer);
  assert.equal(decoded.width, 32);
  assert.ok(new Set(new Uint32Array(UPNG.toRGBA8(decoded)[0])).size <= 4);
});

test("built processing worker resizes RGBA pixels", async () => {
  const [buffer] = await runWorker("processing.worker", [
    {
      target: { width: 8, height: 12 },
      processing: { method: "lanczos3", linearRGB: true, premultiply: true },
    },
  ]);
  assert.equal(buffer.byteLength, 8 * 12 * 4);
});

test("built JPEG and WebP worker loads bundled encoder assets", async () => {
  const buffers = await runWorker("encoder.worker", [
    {
      settings: {
        format: "jpeg",
        quality: 0.8,
        advanced: sanitiseAdvanced({
          jpeg: { encoder: "advanced", subsampling: "444" },
        }),
      },
    },
    {
      settings: {
        format: "webp",
        quality: 0.8,
        advanced: sanitiseAdvanced({
          webp: { encoder: "advanced", mode: "lossless" },
        }),
      },
    },
    {
      settings: {
        format: "avif",
        quality: 0.5,
        advanced: sanitiseAdvanced({ avif: { speed: 8 } }),
      },
    },
  ]);
  assert.deepEqual([...new Uint8Array(buffers[0]).slice(0, 2)], [255, 216]);
  assert.equal(
    new TextDecoder().decode(new Uint8Array(buffers[1]).slice(0, 4)),
    "RIFF",
  );
  const [decoded] = await runWorker("avifDecode.worker", [
    { buffer: buffers[2] },
  ]);
  assert.equal(decoded.byteLength, 32 * 32 * 4);
});
