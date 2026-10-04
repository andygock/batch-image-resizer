import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import UPNG from "upng-js";
import { sanitiseAdvanced } from "./advancedSettings.js";
import { ditherPalette } from "./paletteDither.js";

register("../test-support/wasm-loader.js", import.meta.url);
const { encodeAdvanced, optimisePng } = await import("./advancedCodecs.js");
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url) => {
  const target = new URL(url);
  assert.equal(
    target.hostname,
    "local-wasm.invalid",
    "Codec tests must not access the network",
  );
  const bytes = await readFile(
    new URL(decodeURIComponent(target.pathname.slice(1))),
  );
  return new Response(bytes, {
    headers: { "Content-Type": "application/wasm" },
  });
};
test.after(() => {
  globalThis.fetch = fetchOriginal;
});

function pixels() {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i / 4) % 256;
    data[i + 1] = Math.floor(i / 128) * 7;
    data[i + 2] = 100;
    data[i + 3] = i % 3 === 0 ? 0 : 255;
  }
  return { data, width: 32, height: 32 };
}

function jpegFrame(buffer) {
  const bytes = new Uint8Array(buffer);
  assert.deepEqual([...bytes.slice(0, 2)], [255, 216]);
  for (let offset = 2; offset < bytes.length; ) {
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xc0 || marker === 0xc2)
      return {
        marker,
        components: bytes[offset + 9],
        sampling: bytes[offset + 11],
      };
    offset += length + 2;
  }
  assert.fail("JPEG frame header missing");
}

test("real MozJPEG outputs honour progressive, chroma sampling and greyscale", async () => {
  const settings = {
    format: "jpeg",
    quality: 0.8,
    advanced: sanitiseAdvanced({
      jpeg: { encoder: "advanced", subsampling: "444" },
    }),
  };
  assert.deepEqual(jpegFrame(await encodeAdvanced(pixels(), settings)), {
    marker: 0xc2,
    components: 3,
    sampling: 0x11,
  });
  settings.advanced.jpeg.progressive = false;
  settings.advanced.jpeg.subsampling = "420";
  assert.deepEqual(jpegFrame(await encodeAdvanced(pixels(), settings)), {
    marker: 0xc0,
    components: 3,
    sampling: 0x22,
  });
  settings.advanced.jpeg.greyscale = true;
  assert.equal(
    jpegFrame(await encodeAdvanced(pixels(), settings)).components,
    1,
  );
});

test("real lossless WebP round-trips resized RGBA pixels including hidden RGB", async () => {
  const { default: decode, init } = await import("@jsquash/webp/decode.js");
  const module = await WebAssembly.compile(
    await readFile(
      new URL(
        "../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm",
        import.meta.url,
      ),
    ),
  );
  await init(module);
  const input = pixels();
  const settings = {
    format: "webp",
    quality: 0.3,
    advanced: sanitiseAdvanced({
      webp: { encoder: "advanced", mode: "lossless", exact: true },
    }),
  };
  const output = await encodeAdvanced(input, settings);
  const decoded = await decode(output);
  assert.equal(decoded.width, 32);
  assert.equal(decoded.height, 32);
  assert.deepEqual(decoded.data, input.data);
  settings.advanced.webp.mode = "near-lossless";
  assert.equal((await decode(await encodeAdvanced(input, settings))).width, 32);
  settings.advanced.webp.mode = "lossy";
  settings.advanced.webp.alphaQuality = 100;
  const lossy = await decode(await encodeAdvanced(input, settings));
  for (let i = 3; i < input.data.length; i += 4)
    assert.equal(lossy.data[i], input.data[i]);
});

test("PNG dithering limits the palette and responds to strength", () => {
  const { data, width, height } = pixels();
  const weak = ditherPalette(data.buffer, width, height, 4, 20);
  const strong = ditherPalette(data.buffer, width, height, 4, 100);
  assert.ok(new Set(new Uint32Array(strong)).size <= 4);
  assert.notDeepEqual(new Uint8Array(weak), new Uint8Array(strong));
});

test("real OxiPNG preserves RGBA pixels and writes interlacing", async () => {
  const input = pixels();
  const encoded = UPNG.encode(
    [input.data.buffer],
    input.width,
    input.height,
    0,
  );
  const result = await optimisePng(
    encoded,
    {
      level: 2,
      interlace: true,
      optimiseAlpha: false,
    },
    input,
  );
  assert.equal(new Uint8Array(result)[28], 1);
  assert.deepEqual(
    new Uint8Array(UPNG.toRGBA8(UPNG.decode(result))[0]),
    new Uint8Array(input.data.buffer),
  );
});

test("PNG worker combines reduced palettes, dithering and interlacing", async () => {
  let response;
  globalThis.self = {
    postMessage(value) {
      response = value;
    },
  };
  try {
    await import("./png.worker.js");
    const input = pixels();
    for (const colours of [2, 16]) {
      await self.onmessage({
        data: {
          buffer: input.data.buffer,
          width: input.width,
          height: input.height,
          colours,
          advanced: sanitiseAdvanced({
            png: { dither: 75, level: 2, interlace: true },
          }),
        },
      });
      assert.equal(response.error, undefined);
      assert.equal(response.fallback, undefined);
      const decoded = UPNG.decode(response.buffer);
      assert.equal(new Uint8Array(response.buffer)[28], 1);
      assert.ok(
        new Set(new Uint32Array(UPNG.toRGBA8(decoded)[0])).size <= colours,
      );
    }
  } finally {
    delete globalThis.self;
  }
});
