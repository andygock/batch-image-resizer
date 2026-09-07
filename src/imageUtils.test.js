import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { fitDimensions, nameOutputs, validateSize } from "./imageUtils.js";
import { createJobOwner } from "./jobs.js";

test("thin images retain at least one pixel in both orientations", () => {
  assert.deepEqual(fitDimensions(2000, 1, { width: 512, height: 512 }, true), {
    width: 512,
    height: 1,
  });
  assert.deepEqual(fitDimensions(1, 2000, { width: 512, height: 512 }, true), {
    width: 1,
    height: 512,
  });
});

test("bounding boxes preserve aspect ratio and honour enlargement settings", () => {
  assert.deepEqual(
    fitDimensions(1200, 800, { width: 512, height: 512 }, true),
    { width: 512, height: 341 }
  );
  assert.deepEqual(fitDimensions(100, 50, { width: 512, height: 512 }, true), {
    width: 100,
    height: 50,
  });
  assert.deepEqual(fitDimensions(100, 50, { width: 512, height: 512 }, false), {
    width: 512,
    height: 256,
  });
});

test("invalid dimensions and oversized allocations are rejected", () => {
  for (const width of [0, -1, 1.5, NaN, Infinity, 8193])
    assert.throws(() => validateSize({ width, height: 1 }));
  assert.throws(() => validateSize({ width: 8192, height: 8192 }));
  assert.doesNotThrow(() => validateSize({ width: 4096, height: 4096 }));
});

test("colliding names preserve every file through a ZIP round trip", async () => {
  const names = [
    "photo.png",
    "photo.jpg",
    "PHOTO.webp",
    "photo (2).jpg",
    "photo.jpg",
  ];
  const outputs = nameOutputs(
    names.map((filename, id) => ({ filename, outputExtension: "jpg", id })),
    false,
    ""
  );
  const zip = new JSZip();
  outputs.forEach(({ downloadFilename, id }) =>
    zip.file(downloadFilename, String(id))
  );
  const loaded = await JSZip.loadAsync(
    await zip.generateAsync({ type: "uint8array" })
  );
  assert.equal(Object.keys(loaded.files).length, names.length);
  for (const { downloadFilename, id } of outputs)
    assert.equal(
      await loaded.file(downloadFilename).async("string"),
      String(id)
    );
});

test("output names are flat, portable and nonempty", () => {
  const outputs = nameOutputs(
    ["../../evil.png", "CON.png", ".png"].map((filename) => ({
      filename,
      outputExtension: "png",
    })),
    true,
    "/../bad\\name:"
  );
  for (const { downloadFilename } of outputs) {
    assert.doesNotMatch(downloadFilename, /[/\\:]/);
    assert.ok(downloadFilename.length > 4);
  }
  assert.equal(
    nameOutputs([{ filename: "CON.png", outputExtension: "png" }], false, "")[0]
      .downloadFilename,
    "_CON.png"
  );
});

test("a late job cannot publish after replacement or reset", async () => {
  const owner = createJobOwner();
  const first = owner.start();
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  const published = [];
  const completion = delayed.then(() => {
    if (first.isCurrent()) published.push("old");
  });
  const second = owner.start();
  assert.equal(first.signal.aborted, true);
  assert.equal(second.isCurrent(), true);
  owner.cancel();
  release();
  await completion;
  assert.deepEqual(published, []);
  assert.equal(second.isCurrent(), false);
  assert.equal(second.signal.aborted, true);
});
