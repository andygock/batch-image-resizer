import test from "node:test";
import assert from "node:assert/strict";
import { createResultCache } from "./resultCache.js";
import { createBatchProcessor } from "./batchProcessor.js";

test("variant cache evicts least-recently-used data within its byte budget", () => {
  const cache = createResultCache({ maxBytes: 6, maxEntries: 10 });
  const a = { blob: new Blob(["aaa"]) },
    b = { blob: new Blob(["bbb"]) },
    c = { blob: new Blob(["ccc"]) };
  cache.set("image", "a", a);
  cache.set("image", "b", b);
  cache.get("image", "a");
  cache.set("image", "c", c);
  assert.equal(cache.get("image", "b"), undefined);
  assert.equal(cache.previous("image", "c"), a);
});

test("single-image trials leave batch results unchanged and can be reused on apply", async () => {
  const calls = [];
  const processor = createBatchProcessor(async ({ id }, settings) => {
    calls.push([id, settings.quality]);
    return { id, blob: new Blob([id]) };
  });
  const images = [{ id: "a" }, { id: "b" }];
  const settings = {
    bounds: { width: 512, height: 512 },
    format: "jpeg",
    quality: 0.8,
  };
  let state;
  const publish = (next) => {
    state = next;
  };
  await processor.run(images, settings, {}, publish);
  await processor.preview(
    images[0],
    { ...settings, quality: 0.7 },
    new AbortController().signal,
  );
  assert.equal(state.records.a.result.settings.quality, 0.8);
  await processor.run(images, { ...settings, quality: 0.7 }, {}, publish);
  assert.deepEqual(calls, [
    ["a", 0.8],
    ["b", 0.8],
    ["a", 0.7],
    ["b", 0.7],
  ]);
  await processor.run(images, settings, {}, publish);
  assert.equal(calls.length, 4);
});
