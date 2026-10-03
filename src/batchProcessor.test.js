import test from "node:test";
import assert from "node:assert/strict";
import { createBatchProcessor, resolveSettings } from "./batchProcessor.js";

const settings = { bounds: { width: 512, height: 512 }, format: "jpeg", quality: 0.8, disableUpscale: true };
const sources = [{ id: "a" }, { id: "b" }];

test("keep source format resolves each image independently", async () => {
  const seen = [];
  const processor = createBatchProcessor(async (source, options) => {
    seen.push(options.format);
    return { id: source.id };
  });
  await processor.run([{ id: "a", sourceFormat: "png" }, { id: "b", sourceFormat: "webp" }], { ...settings, format: "source" }, {}, () => {});
  assert.deepEqual(seen, ["png", "webp"]);
  assert.equal(resolveSettings({ sourceFormat: "png" }, settings).format, "jpeg");
});

test("ready images remain accessible while another image processes", async () => {
  let complete;
  const processor = createBatchProcessor(async ({ id }) => id === "a" ? { id } : new Promise((resolve) => { complete = resolve; }));
  let state;
  const publish = (next) => { state = next; };
  await processor.run(sources.slice(0, 1), settings, {}, publish);
  const work = processor.run(sources, settings, {}, publish);
  assert.equal(state.records.a.status, "ready");
  assert.equal(state.records.b.status, "processing");
  complete({ id: "b" });
  await work;
  assert.equal(state.progress, 2);
  assert.equal(state.isProcessing, false);
});

test("superseded processing cannot replace a newer result", async () => {
  let complete;
  const processor = createBatchProcessor(async (_, options) => options.quality === 0.8 ? new Promise((resolve) => { complete = resolve; }) : { quality: options.quality });
  let state;
  const publish = (next) => { state = next; };
  const old = processor.run(sources.slice(0, 1), settings, {}, publish);
  await processor.run(sources.slice(0, 1), { ...settings, quality: 0.7 }, {}, publish);
  complete({ quality: 0.8 });
  await old;
  assert.equal(state.records.a.result.quality, 0.7);
});

test("failed sources remain actionable and retry does not repeat ready work", async () => {
  const calls = [];
  let failing = true;
  const processor = createBatchProcessor(async ({ id }) => {
    calls.push(id);
    if (id === "b" && failing) throw new Error("decode failed");
    return { id };
  });
  let state;
  const publish = (next) => { state = next; };
  await processor.run(sources, settings, {}, publish);
  assert.equal(state.records.b.status, "error");
  await processor.run([...sources, { id: "c" }], settings, {}, publish);
  assert.deepEqual(calls, ["a", "b", "c"]);
  failing = false;
  await processor.run(sources, settings, { retryIds: ["b"] }, publish);
  assert.deepEqual(calls, ["a", "b", "c", "b"]);
  assert.equal(state.records.b.status, "ready");
});
