import test from "node:test";
import assert from "node:assert/strict";
import { createZipExporter } from "./zipExporter.js";

test("exports retain their snapshot and reject duplicate starts", async () => {
  let finish;
  const saved = [], files = [];
  const exporter = createZipExporter((...args) => saved.push(args), () => ({
    file(name) { files.push(name); },
    generateAsync(_, progress) { progress({ percent: 42.5 }); return new Promise((resolve) => { finish = resolve; }); },
  }));
  let state;
  const outputs = [{ downloadFilename: "before.jpg", blob: new Blob(["image"]) }];
  const work = exporter.start(outputs, "batch.zip", (next) => { state = next; });
  outputs[0].downloadFilename = "after.jpg";
  await exporter.start(outputs, "duplicate.zip", () => {});
  assert.equal(state.progress, 42);
  finish(new Blob(["zip"]));
  const snapshot = await work;
  assert.deepEqual(files, ["before.jpg"]);
  assert.equal(snapshot[0].downloadFilename, "before.jpg");
  assert.equal(saved.length, 1);
  assert.equal(state.isZipping, false);
});

test("cancelling an archive suppresses its late download", async () => {
  let finish;
  const saved = [];
  const exporter = createZipExporter((blob) => saved.push(blob), () => ({ file() {}, generateAsync() { return new Promise((resolve) => { finish = resolve; }); } }));
  let state;
  const work = exporter.start([{ downloadFilename: "image.jpg" }], "batch.zip", (next) => { state = next; });
  exporter.cancel();
  finish(new Blob(["zip"]));
  await work;
  assert.equal(saved.length, 0);
  assert.equal(state.message, "Export cancelled.");
});
