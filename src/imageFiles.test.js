import assert from "node:assert/strict";
import test from "node:test";
import { createBatchStorage } from "./batchStorage.js";
import { inspectImageFile, partitionImageFiles } from "./imageFiles.js";

function imageFile(name, bytes, type = "") {
  return new File([Uint8Array.from(bytes)], name, { type });
}

const jpeg = [0xff, 0xd8, 0xff, 0x00, 0x01];
const jpegOther = [0xff, 0xd8, 0xff, 0x00, 0x02];
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const webp = [
  0x52, 0x49, 0x46, 0x46, 0x01, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
];

test("imported bytes survive loss of the original file and batch storage round trips", async () => {
  const bytes = new Uint8Array(128 * 1024 + 7);
  bytes.set(png);
  bytes[bytes.length - 1] = 123;
  const original = new File([bytes], "ComfyUI_temp.png", {
    type: "image/png",
    lastModified: 123456,
  });
  const { accepted } = await partitionImageFiles([original]);
  const imported = accepted[0];
  assert.notEqual(imported.file, original);
  original.slice = () => {
    throw new DOMException("Temporary file removed", "NotReadableError");
  };
  assert.equal(imported.file.name, original.name);
  assert.equal(imported.file.type, original.type);
  assert.equal(imported.file.lastModified, original.lastModified);
  assert.deepEqual(new Uint8Array(await imported.file.arrayBuffer()), bytes);
  const duplicate = await partitionImageFiles(
    [new File([bytes], "another.png")],
    accepted,
  );
  assert.deepEqual(duplicate.duplicates, ["another.png"]);
  let stored;
  const storage = createBatchStorage({
    async writeSnapshot(snapshot) {
      stored = structuredClone(snapshot);
    },
    async readSnapshot() {
      return stored;
    },
  });
  await storage.saveBatch({ sources: [{ ...imported, id: "1" }] });
  const restored = await storage.loadBatch();
  assert.deepEqual(
    new Uint8Array(await restored.sources[0].file.arrayBuffer()),
    bytes,
  );
  assert.equal(restored.sources[0].file.name, original.name);
});

test("a file that becomes unreadable during import is rejected before processing", async () => {
  let reads = 0;
  const file = {
    name: "disappearing.png",
    size: png.length,
    slice() {
      if (reads++)
        throw new DOMException("Temporary file removed", "NotReadableError");
      return new Blob([Uint8Array.from(png)]);
    },
  };
  const result = await partitionImageFiles([file]);
  assert.deepEqual(result.accepted, []);
  assert.match(result.errors[0].message, /Could not read.*disappearing.png/);
});

test("image signatures identify JPEG, PNG and WebP regardless of MIME hints", async () => {
  const files = [
    imageFile("photo.jpg", jpeg, ""),
    imageFile("graphic.png", png, "application/octet-stream"),
    imageFile("animation.webp", webp, "image/jpeg"),
  ];
  const results = await Promise.all(files.map(inspectImageFile));
  assert.deepEqual(
    results.map(({ sourceFormat }) => sourceFormat),
    ["jpeg", "png", "webp"],
  );
  assert.deepEqual(
    results.map(({ file }) => file),
    files,
  );
});

test("invalid bytes are rejected with the filename even when MIME is supported", async () => {
  const file = imageFile("broken.webp", [0, 1, 2, 3], "image/webp");
  await assert.rejects(
    inspectImageFile(file),
    /broken\.webp.*not a supported JPEG, PNG or WebP/,
  );
  const result = await partitionImageFiles([file]);
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.duplicates, []);
  assert.equal(result.errors[0].filename, "broken.webp");
  assert.match(result.errors[0].message, /broken\.webp/);
});

test("same filename with different bytes is accepted", async () => {
  const first = imageFile("same.jpg", jpeg);
  const second = imageFile("same.jpg", jpegOther);
  const result = await partitionImageFiles([first, second]);
  assert.deepEqual(
    result.accepted.map(({ file }) => file),
    [first, second],
  );
  assert.deepEqual(result.duplicates, []);
  assert.deepEqual(result.errors, []);
});

test("exact bytes match existing sources regardless of filename", async () => {
  const existing = imageFile("old-name.jpg", jpeg);
  const incoming = imageFile("new-name.jpg", jpeg);
  const result = await partitionImageFiles(
    [incoming],
    [{ file: existing, sourceFormat: "jpeg" }],
  );
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.duplicates, ["new-name.jpg"]);
  assert.deepEqual(result.errors, []);
});

test("same-size files with different bytes are not duplicates", async () => {
  const first = imageFile("first.jpg", jpeg);
  const second = imageFile("second.jpg", jpegOther);
  assert.equal(first.size, second.size);
  const result = await partitionImageFiles([second], [first]);
  assert.deepEqual(
    result.accepted.map(({ file }) => file),
    [second],
  );
  assert.deepEqual(result.duplicates, []);
});

test("incoming duplicates are reported in input order and allowDuplicates keeps them", async () => {
  const first = imageFile("one.jpg", jpeg);
  const distinct = imageFile("two.jpg", jpegOther);
  const duplicate = imageFile("three.jpg", jpeg);
  const files = [first, distinct, duplicate];
  const result = await partitionImageFiles(files);
  assert.deepEqual(
    result.accepted.map(({ file }) => file),
    [first, distinct],
  );
  assert.deepEqual(result.duplicates, ["three.jpg"]);
  assert.deepEqual(result.errors, []);

  const allowed = await partitionImageFiles(files, [], {
    allowDuplicates: true,
  });
  assert.deepEqual(
    allowed.accepted.map(({ file }) => file),
    files,
  );
  assert.deepEqual(allowed.duplicates, []);
  assert.deepEqual(allowed.errors, []);
});
