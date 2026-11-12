import assert from "node:assert/strict";
import test from "node:test";
import { tiffFixture } from "../test-support/inputFixtures.js";
import {
  headerDimensions,
  MAX_FILE_BYTES,
  preflightImage,
  validateProcessingAllocation,
  validateSourceDimensions,
} from "./imageLimits.js";

function png(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test("header dimensions reject oversized images before full file reads", async () => {
  await assert.rejects(
    preflightImage(new File([png(8192, 8192)], "large.png")),
    /33,554,432 pixels/,
  );
  let read = false;
  await assert.rejects(
    preflightImage({
      size: MAX_FILE_BYTES + 1,
      slice() {
        read = true;
      },
    }),
    /64 MiB/,
  );
  assert.equal(read, false);
  assert.deepEqual(headerDimensions(png(512, 341)), [512, 341]);
  assert.throws(() => validateSourceDimensions(0, 100), /invalid dimensions/);
  assert.doesNotThrow(() => validateSourceDimensions(8192, 4096));
});

test("JPEG dimensions are found beyond metadata segments", () => {
  const jpeg = Uint8Array.from([
    255, 216, 255, 224, 0, 4, 0, 0, 255, 194, 0, 8, 8, 1, 0, 2, 0, 0,
  ]);
  assert.deepEqual(headerDimensions(jpeg), [512, 256]);
  assert.equal(headerDimensions(jpeg.subarray(0, 12)), null);
});

test("WebP extended, lossy and lossless headers expose their canvas dimensions", () => {
  const bytes = new Uint8Array(30);
  const text = (at, value) => bytes.set(new TextEncoder().encode(value), at);
  text(0, "RIFF");
  text(8, "WEBP");
  text(12, "VP8X");
  bytes[24] = 99;
  bytes[27] = 49;
  assert.deepEqual(headerDimensions(bytes), [100, 50]);
  text(12, "VP8 ");
  bytes[23] = 0x9d;
  bytes[24] = 1;
  bytes[25] = 0x2a;
  new DataView(bytes.buffer).setUint16(26, 100, true);
  new DataView(bytes.buffer).setUint16(28, 50, true);
  assert.deepEqual(headerDimensions(bytes), [100, 50]);
  text(12, "VP8L");
  bytes[20] = 0x2f;
  new DataView(bytes.buffer).setUint32(21, 99 | (49 << 14), true);
  assert.deepEqual(headerDimensions(bytes), [100, 50]);
});

test("AVIF dimension checks traverse property boxes but ignore payload lookalikes", () => {
  const box = (kind, payload) => {
    const bytes = new Uint8Array(8 + payload.length);
    new DataView(bytes.buffer).setUint32(0, bytes.length);
    bytes.set(new TextEncoder().encode(kind), 4);
    bytes.set(payload, 8);
    return bytes;
  };
  const dimensions = new Uint8Array(12);
  new DataView(dimensions.buffer).setUint32(4, 8192);
  new DataView(dimensions.buffer).setUint32(8, 8192);
  const ftyp = box("ftyp", new TextEncoder().encode("avif0000"));
  const ispe = box("ispe", dimensions);
  const meta = box(
    "meta",
    Uint8Array.from([0, 0, 0, 0, ...box("iprp", box("ipco", ispe))]),
  );
  assert.throws(
    () => headerDimensions(Uint8Array.from([...ftyp, ...meta])),
    /33,554,432/,
  );
  assert.equal(
    headerDimensions(Uint8Array.from([...ftyp, ...box("mdat", ispe)])),
    null,
  );
});

test("processing budgets reject large intermediate buffers before allocation", () => {
  assert.throws(
    () =>
      validateProcessingAllocation(
        { width: 8000, height: 4000 },
        { width: 5600, height: 2800 },
        { method: "lanczos3" },
      ),
    /512 MiB/,
  );
  assert.doesNotThrow(() =>
    validateProcessingAllocation(
      { width: 8000, height: 4000 },
      { width: 512, height: 256 },
      { method: "lanczos3" },
    ),
  );
  assert.doesNotThrow(() =>
    validateProcessingAllocation(
      { width: 4096, height: 4096 },
      { width: 4096, height: 4096 },
      { method: "auto", sharpen: true, radius: 3 },
    ),
  );
});

test("BMP dimensions cover Windows, top-down and OS/2 headers", async () => {
  const bytes = new Uint8Array(54);
  bytes.set([0x42, 0x4d]);
  const view = new DataView(bytes.buffer);
  view.setUint32(14, 40, true);
  view.setInt32(18, 512, true);
  view.setInt32(22, -341, true);
  assert.deepEqual(headerDimensions(bytes), [512, 341]);
  assert.equal(headerDimensions(bytes.subarray(0, 25)), null);
  view.setInt32(18, 8192, true);
  view.setInt32(22, -8192, true);
  await assert.rejects(
    preflightImage(new File([bytes], "large.bmp")),
    /33,554,432 pixels/,
  );
  view.setInt32(18, -1, true);
  await assert.rejects(
    preflightImage(new File([bytes], "invalid.bmp")),
    /invalid dimensions/,
  );
  view.setUint32(14, 12, true);
  view.setUint16(18, 100, true);
  view.setUint16(20, 50, true);
  assert.deepEqual(headerDimensions(bytes.subarray(0, 26)), [100, 50]);
});

test("GIF and both TIFF byte orders are checked before decoding", async () => {
  const gif = new Uint8Array(10);
  gif.set(new TextEncoder().encode("GIF89a"));
  new DataView(gif.buffer).setUint16(6, 8192, true);
  new DataView(gif.buffer).setUint16(8, 8192, true);
  await assert.rejects(
    preflightImage(new File([gif], "huge.gif")),
    /33,554,432/,
  );
  for (const little of [true, false]) {
    assert.deepEqual(headerDimensions(tiffFixture({ little })), [2, 1]);
    assert.equal(
      headerDimensions(tiffFixture({ little }).subarray(0, 20)),
      null,
    );
    await assert.rejects(
      preflightImage(
        new File(
          [tiffFixture({ little, width: 8192, height: 8192 })],
          "huge.tif",
        ),
      ),
      /33,554,432/,
    );
  }
});
