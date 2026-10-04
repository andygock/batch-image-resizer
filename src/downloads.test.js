import assert from "node:assert/strict";
import test from "node:test";
import { archiveFilename, downloadRequestKey } from "./downloads.js";

const output = {
  id: "a",
  downloadFilename: "image_small.webp",
  outputExtension: "webp",
  settings: {
    bounds: { width: 1024, height: 1024 },
    format: "webp",
    quality: 0.8,
  },
};
test("archives identify the captured size, format, count and time", () => {
  assert.equal(
    archiveFilename([output], new Date("2026-10-04T01:02:03Z")),
    "images-1024x1024-webp-1-20261004T010203Z.zip",
  );
});
test("download markers distinguish settings and filename changes", () => {
  assert.notEqual(
    downloadRequestKey(output),
    downloadRequestKey({
      ...output,
      settings: { ...output.settings, quality: 0.7 },
    }),
  );
  assert.notEqual(
    downloadRequestKey(output),
    downloadRequestKey({ ...output, downloadFilename: "renamed.webp" }),
  );
});
