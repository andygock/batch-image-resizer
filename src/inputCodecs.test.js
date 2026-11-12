import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { deflateSync } from "node:zlib";
import {
  multipageTiffFixture,
  tiffFixture,
} from "../test-support/inputFixtures.js";

register("../test-support/wasm-loader.js", import.meta.url);
const { decodeHeic, decodeTiff } = await import("./inputCodecs.js");

test("local HEIC WASM decodes the primary image to RGBA", async () => {
  const file = await readFile(
    new URL("../test-support/fixtures/basic-8bit-srgb.heic", import.meta.url),
  );
  const pixels = await decodeHeic(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );
  assert.equal(pixels.width, 1600);
  assert.equal(pixels.height, 1200);
  assert.equal(pixels.data.length, 1600 * 1200 * 4);
  assert.ok(pixels.data.some((value) => value !== 0));
  await assert.rejects(decodeHeic(new ArrayBuffer(16)), /No readable image/);
});

test("TIFF decodes first-page RGB pixels in both byte orders", async () => {
  for (const little of [true, false]) {
    const pixels = await decodeTiff(tiffFixture({ little }).buffer);
    assert.equal(pixels.width, 2);
    assert.equal(pixels.height, 1);
    assert.deepEqual([...pixels.data], [255, 0, 0, 255, 0, 255, 0, 255]);
  }
});

test("TIFF orientation is applied and oversized pages fail before decompression", async () => {
  const rotated = await decodeTiff(tiffFixture({ orientation: 6 }).buffer);
  assert.equal(rotated.width, 1);
  assert.equal(rotated.height, 2);
  assert.deepEqual([...rotated.data], [255, 0, 0, 255, 0, 255, 0, 255]);
  await assert.rejects(
    decodeTiff(tiffFixture({ width: 8192, height: 8192 }).buffer),
    /33,554,432/,
  );
  await assert.rejects(
    decodeTiff(new ArrayBuffer(8)),
    /No readable page|invalid dimensions/,
  );
});

test("multipage TIFF imports only the first page", async () => {
  const pixels = await decodeTiff(multipageTiffFixture().buffer);
  assert.deepEqual([...pixels.data], [255, 0, 0, 255, 0, 255, 0, 255]);
});

test("TIFF Deflate compression uses the local pako dependency", async () => {
  const bytes = tiffFixture();
  const compressed = deflateSync(bytes.subarray(140));
  const packed = new Uint8Array(140 + compressed.length);
  packed.set(bytes.subarray(0, 140));
  packed.set(compressed, 140);
  const view = new DataView(packed.buffer);
  view.setUint16(10 + 3 * 12 + 8, 8, true);
  view.setUint32(10 + 9 * 12 + 8, compressed.length, true);
  const pixels = await decodeTiff(packed.buffer);
  assert.deepEqual([...pixels.data], [255, 0, 0, 255, 0, 255, 0, 255]);
});
