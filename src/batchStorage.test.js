import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  BATCH_DATABASE_NAME,
  createBatchStorage,
  createIndexedDbAdapter,
} from "./batchStorage.js";

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
    /Could not save saved batch: TypeError: Each saved source must have a string id/,
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

function source(id) {
  return {
    id,
    file: new File([`bytes-${id}`], `${id}.png`, {
      type: "image/png",
      lastModified: 1234,
    }),
    sourceFormat: "png",
  };
}

test("settings saves reuse stored image bytes and removal prunes unused images", async (t) => {
  const storage = createBatchStorage(createIndexedDbAdapter(new IDBFactory()));
  const puts = [];
  const put = IDBObjectStore.prototype.put;
  t.mock.method(IDBObjectStore.prototype, "put", function (value, key) {
    puts.push({ store: this.name, value, key });
    return put.call(this, value, key);
  });
  const first = source("first");
  const read = t.mock.method(first.file, "arrayBuffer");
  await storage.saveBatch({ sources: [first] });
  for (const outputFormat of ["webp", "jpeg", "png", "source"])
    await storage.saveBatch({
      sources: [first],
      preferences: { outputFormat },
    });
  assert.equal(read.mock.callCount(), 1);
  const imageWrites = puts.filter(({ store }) => store === "sources");
  assert.equal(imageWrites.length, 1);
  assert.ok(imageWrites[0].value instanceof ArrayBuffer);
  for (const { value } of puts.filter(({ store }) => store === "snapshots"))
    assert.equal("file" in value.sources[0], false);
  const second = source("second");
  await storage.saveBatch({ sources: [first, second] });
  await storage.saveBatch({ sources: [second] });
  const saved = await storage.loadBatch();
  assert.equal(saved.sources.length, 1);
  assert.equal(await saved.sources[0].file.text(), "bytes-second");
  assert.equal(saved.sources[0].file.name, "second.png");
  assert.equal(saved.sources[0].file.type, "image/png");
  assert.equal(saved.sources[0].file.lastModified, 1234);
  await storage.saveBatch({ sources: [first, second] });
  assert.equal(read.mock.callCount(), 2);
});

test("request failures retain the real error and roll back image and settings changes", async (t) => {
  const storage = createBatchStorage(createIndexedDbAdapter(new IDBFactory()));
  const first = source("first");
  const second = source("second");
  await storage.saveBatch({
    sources: [first],
    preferences: { outputFormat: "jpeg" },
  });
  const put = IDBObjectStore.prototype.put;
  const mock = t.mock.method(
    IDBObjectStore.prototype,
    "put",
    function (value, key) {
      // Adding the existing snapshot key produces a real bubbling request failure.
      if (this.name === "snapshots") return this.add(value, key);
      return put.call(this, value, key);
    },
  );
  await assert.rejects(
    storage.saveBatch({
      sources: [second],
      preferences: { outputFormat: "webp" },
    }),
    (error) => {
      assert.equal(error.cause.name, "ConstraintError");
      assert.match(error.message, /ConstraintError/);
      assert.doesNotMatch(error.message, /IndexedDB transaction failed|\.\.$/);
      return true;
    },
  );
  mock.mock.restore();
  const saved = await storage.loadBatch();
  assert.equal(saved.preferences.outputFormat, "jpeg");
  assert.equal(await saved.sources[0].file.text(), "bytes-first");
  assert.equal(saved.sources.length, 1);
});

test("transient transaction aborts retry automatically with intact image bytes", async (t) => {
  const storage = createBatchStorage(createIndexedDbAdapter(new IDBFactory()));
  const put = IDBObjectStore.prototype.put;
  let aborted = false;
  t.mock.method(IDBObjectStore.prototype, "put", function (value, key) {
    const request = put.call(this, value, key);
    if (!aborted && this.name === "sources") {
      aborted = true;
      queueMicrotask(() => this.transaction.abort());
    }
    return request;
  });
  await storage.saveBatch({ sources: [source("first")] });
  assert.equal(aborted, true);
  const saved = await storage.loadBatch();
  assert.equal(await saved.sources[0].file.text(), "bytes-first");
});

test("version one batches restore and migrate without dropping image bytes", async () => {
  const indexedDB = new IDBFactory();
  const adapter = memoryAdapter();
  await createBatchStorage(adapter).saveBatch({ sources: [source("legacy")] });
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(BATCH_DATABASE_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("snapshots");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put(adapter.record, "current");
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
  const storage = createBatchStorage(createIndexedDbAdapter(indexedDB));
  const legacy = await storage.loadBatch();
  assert.equal(await legacy.sources[0].file.text(), "bytes-legacy");
  await storage.saveBatch(legacy);
  const migrated = await storage.loadBatch();
  assert.equal(await migrated.sources[0].file.text(), "bytes-legacy");
  assert.equal(migrated.sources[0].file.name, "legacy.png");
});

test("permanent storage failures are not retried and transient retries are bounded", async () => {
  for (const [name, attempts] of [
    ["QuotaExceededError", 1],
    ["UnknownError", 2],
  ]) {
    let writes = 0;
    const storage = createBatchStorage({
      async writeSnapshot() {
        writes++;
        throw new DOMException("Cannot write.", name);
      },
    });
    await assert.rejects(storage.saveBatch({ sources: [] }), (error) => {
      assert.equal(error.cause.name, name);
      assert.doesNotMatch(error.message, /\.$/);
      return true;
    });
    assert.equal(writes, attempts);
  }
});

test("saving turned off during file preparation cannot write a stale snapshot", async (t) => {
  const storage = createBatchStorage(createIndexedDbAdapter(new IDBFactory()));
  let saving = true;
  const image = source("cancelled");
  const read = image.file.arrayBuffer.bind(image.file);
  t.mock.method(image.file, "arrayBuffer", async () => {
    saving = false;
    return read();
  });
  await storage.saveBatch({ sources: [image] }, () => saving);
  assert.equal(await storage.loadBatch(), null);
});

test("synchronous clone failures roll back already queued source writes", async (t) => {
  const storage = createBatchStorage(createIndexedDbAdapter(new IDBFactory()));
  await storage.saveBatch({ sources: [source("original")] });
  const put = IDBObjectStore.prototype.put;
  const mock = t.mock.method(
    IDBObjectStore.prototype,
    "put",
    function (value, key) {
      if (this.name === "snapshots")
        throw new DOMException("Could not clone snapshot.", "DataCloneError");
      return put.call(this, value, key);
    },
  );
  await assert.rejects(
    storage.saveBatch({ sources: [source("replacement")] }),
    (error) => error.cause.name === "DataCloneError",
  );
  mock.mock.restore();
  const saved = await storage.loadBatch();
  assert.equal(saved.sources[0].id, "original");
  assert.equal(await saved.sources[0].file.text(), "bytes-original");
});
