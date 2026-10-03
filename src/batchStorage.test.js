import test from "node:test";
import assert from "node:assert/strict";
import { createBatchStorage } from "./batchStorage.js";

function memoryAdapter(initial = null) {
  let record = initial;
  return {
    get record() {
      return record;
    },
    async readSnapshot() {
      return record;
    },
    async writeSnapshot(snapshot) {
      record = snapshot;
    },
    async deleteDatabase() {
      record = null;
    },
  };
}

test("batch storage saves a single snapshot and restores file metadata and settings", async () => {
  const adapter = memoryAdapter();
  const storage = createBatchStorage(adapter);
  const file = new Blob(["image"], { type: "image/png" });
  const snapshot = {
    sources: [{ id: "source-1", file, sourceFormat: "png" }],
    preferences: {
      outputFormat: "webp",
      boundingBox: { width: 640, height: 480 },
    },
  };

  await storage.saveBatch(snapshot);
  const saved = await storage.loadBatch();
  assert.deepEqual(
    saved.sources.map(({ id, sourceFormat }) => ({ id, sourceFormat })),
    [{ id: "source-1", sourceFormat: "png" }],
  );
  assert.equal(await saved.sources[0].file.text(), "image");
  assert.equal(saved.sources[0].file.type, "image/png");
  assert.equal(saved.sources[0].file.name, "image");
  assert.equal(saved.preferences.outputFormat, "webp");
  assert.deepEqual(saved.preferences.boundingBox, { width: 640, height: 480 });
  assert.equal(adapter.record.sources.length, 1);
  assert.equal(adapter.record.sources[0].fileName, "");
});

test("clear is queued after earlier saves and removes the database snapshot", async () => {
  let releaseSave;
  let record = null;
  const order = [];
  const storage = createBatchStorage({
    readSnapshot: async () => record,
    writeSnapshot: async (snapshot) => {
      order.push("save-start");
      await new Promise((resolve) => {
        releaseSave = resolve;
      });
      record = snapshot;
      order.push("save-end");
    },
    deleteDatabase: async () => {
      order.push("delete");
      record = null;
    },
  });
  const save = storage.saveBatch({ sources: [], preferences: {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const clear = storage.clearBatch();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, ["save-start"]);

  releaseSave();
  await Promise.all([save, clear]);
  assert.deepEqual(order, ["save-start", "save-end", "delete"]);
  assert.equal(record, null);
  assert.equal(await storage.loadBatch(), null);
});

test("invalid snapshots and adapter errors reach callers with context", async () => {
  const storage = createBatchStorage(memoryAdapter());
  await assert.rejects(
    storage.saveBatch({ sources: [{ id: 4, file: new Blob([]) }] }),
    /Could not save saved batch: Each saved source must have a string id/,
  );

  const broken = createBatchStorage({
    readSnapshot: async () => {
      throw new Error("disk failure");
    },
    writeSnapshot: async () => {},
    deleteDatabase: async () => {},
  });
  await assert.rejects(
    broken.loadBatch(),
    /Could not load saved batch: disk failure/,
  );
  assert.equal(await broken.clearBatch(), undefined);
});
