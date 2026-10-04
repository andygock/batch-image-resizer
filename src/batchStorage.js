import { sanitisePreferences } from "./preferences.js";

export const BATCH_DATABASE_NAME = "batch-image-resizer:batch:v1";
export const BATCH_DATABASE_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "current";

function storageError(action, error) {
  return new Error(
    `Could not ${action} saved batch: ${error?.message || "storage is unavailable"}`,
    {
      cause: error,
    },
  );
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB request failed."));
  });
}

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    try {
      request = indexedDB.open(BATCH_DATABASE_NAME, BATCH_DATABASE_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error || new Error("IndexedDB could not be opened."));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("IndexedDB is blocked by another open connection."));
    };
  });
}

function withDatabase(indexedDB, mode, run) {
  return openDatabase(indexedDB).then(
    (database) =>
      new Promise((resolve, reject) => {
        let result;
        let settled = false;
        let transaction;
        try {
          transaction = database.transaction(STORE_NAME, mode);
          result = run(transaction.objectStore(STORE_NAME));
          // A failed request can reject before the transaction's abort event arrives.
          Promise.resolve(result).catch(() => {});
        } catch (error) {
          database.close();
          reject(error);
          return;
        }
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          database.close();
          Promise.resolve(result).then(resolve, reject);
        };
        transaction.onabort = transaction.onerror = () => {
          if (settled) return;
          settled = true;
          database.close();
          reject(
            transaction.error || new Error("IndexedDB transaction failed."),
          );
        };
      }),
  );
}

function createIndexedDbAdapter(indexedDB) {
  return {
    readSnapshot: async () => {
      if (
        typeof indexedDB.databases === "function" &&
        !(await indexedDB.databases()).some(
          ({ name }) => name === BATCH_DATABASE_NAME,
        )
      )
        return null;
      return withDatabase(indexedDB, "readonly", (store) =>
        requestPromise(store.get(SNAPSHOT_KEY)),
      );
    },
    writeSnapshot: (snapshot) =>
      withDatabase(indexedDB, "readwrite", (store) =>
        requestPromise(store.put(snapshot, SNAPSHOT_KEY)),
      ),
    deleteDatabase: () =>
      new Promise((resolve, reject) => {
        let request;
        let settled = false;
        try {
          request = indexedDB.deleteDatabase(BATCH_DATABASE_NAME);
        } catch (error) {
          reject(error);
          return;
        }
        request.onsuccess = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        request.onerror = () => {
          if (settled) return;
          settled = true;
          reject(
            request.error ||
              new Error("IndexedDB database could not be deleted."),
          );
        };
        request.onblocked = () => {
          if (settled) return;
          settled = true;
          reject(
            new Error(
              "IndexedDB deletion is blocked by another open connection.",
            ),
          );
        };
      }),
  };
}

function validateAndPrepareSnapshot(snapshot) {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !Array.isArray(snapshot.sources)
  )
    throw new TypeError("A batch snapshot must contain a sources array.");
  const sources = snapshot.sources.map((source) => {
    if (!source || typeof source !== "object" || typeof source.id !== "string")
      throw new TypeError("Each saved source must have a string id.");
    if (!(source.file instanceof Blob))
      throw new TypeError(
        `Saved source ${source.id} must contain a File or Blob.`,
      );
    if (!["jpeg", "png", "webp"].includes(source.sourceFormat))
      throw new TypeError(
        `Saved source ${source.id} has an unsupported format.`,
      );
    const file = source.file;
    return {
      id: source.id,
      file,
      sourceFormat:
        typeof source.sourceFormat === "string" ? source.sourceFormat : "",
      fileName: typeof file.name === "string" ? file.name : "",
      fileType: typeof file.type === "string" ? file.type : "",
      lastModified: Number.isFinite(file.lastModified) ? file.lastModified : 0,
    };
  });
  if (new Set(sources.map(({ id }) => id)).size !== sources.length)
    throw new TypeError("Saved sources must have unique ids.");
  const sourceIds = new Set(sources.map(({ id }) => id));
  const selectedIds = Array.isArray(snapshot.selectedIds)
    ? snapshot.selectedIds.filter((id) => sourceIds.has(id))
    : [];
  const names = [];
  const usedNames = new Set();
  const usedIds = new Set();
  for (const entry of Array.isArray(snapshot.downloadContext?.names)
    ? snapshot.downloadContext.names
    : []) {
    if (!Array.isArray(entry)) continue;
    const [id, assignment] = entry;
    const name = assignment?.name;
    if (
      !sourceIds.has(id) ||
      usedIds.has(id) ||
      typeof assignment?.signature !== "string" ||
      assignment.signature.length > 2048 ||
      typeof name !== "string" ||
      !name ||
      name.length > 200
    )
      continue;
    // Stored names are untrusted and must remain portable, flat download names.
    if (
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters in untrusted stored filenames.
      /[<>:"/\\|?*\u0000-\u001f]/.test(name) ||
      /^[. ]|[. ]$/.test(name) ||
      usedNames.has(name.toLowerCase())
    )
      continue;
    names.push([id, { signature: assignment.signature, name }]);
    usedIds.add(id);
    usedNames.add(name.toLowerCase());
  }
  const requests = Array.isArray(snapshot.downloadContext?.requests)
    ? snapshot.downloadContext.requests
        .filter((key) => typeof key === "string" && key.length <= 4096)
        .slice(-2000)
    : [];
  return {
    sources,
    preferences: sanitisePreferences(snapshot.preferences),
    paused: snapshot.paused === true,
    selectedIds,
    downloadContext: { names, requests },
  };
}

function restoreFile(source) {
  let file = source.file;
  if (
    typeof File === "function" &&
    typeof Blob === "function" &&
    file instanceof Blob &&
    !(file instanceof File)
  ) {
    file = new File([file], source.fileName || "image", {
      type: source.fileType || file.type,
      lastModified: source.lastModified || 0,
    });
  }
  return { id: source.id, file, sourceFormat: source.sourceFormat };
}

/**
 * Create a serialised batch store. An adapter can be injected by tests; it must
 * implement readSnapshot, writeSnapshot and deleteDatabase promise methods.
 */
export function createBatchStorage(adapter) {
  let queue = Promise.resolve();
  const enqueue = (operation) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };

  return {
    loadBatch() {
      return enqueue(async () => {
        try {
          const stored = await adapter.readSnapshot();
          if (!stored || !Array.isArray(stored.sources)) return null;
          const clean = validateAndPrepareSnapshot(stored);
          return {
            sources: stored.sources.map(restoreFile),
            preferences: sanitisePreferences(stored.preferences),
            paused: stored.paused === true,
            selectedIds: clean.selectedIds,
            downloadContext: clean.downloadContext,
          };
        } catch (error) {
          throw storageError("load", error);
        }
      });
    },
    saveBatch(snapshot, shouldSave = () => true) {
      return enqueue(async () => {
        try {
          if (!shouldSave()) return;
          await adapter.writeSnapshot(validateAndPrepareSnapshot(snapshot));
        } catch (error) {
          throw storageError("save", error);
        }
      });
    },
    clearBatch() {
      return enqueue(async () => {
        try {
          await adapter.deleteDatabase();
        } catch (error) {
          throw storageError("clear", error);
        }
      });
    },
  };
}

const defaultStorage = createBatchStorage({
  readSnapshot: () => {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is unavailable.");
    return createIndexedDbAdapter(globalThis.indexedDB).readSnapshot();
  },
  writeSnapshot: (snapshot) => {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is unavailable.");
    return createIndexedDbAdapter(globalThis.indexedDB).writeSnapshot(snapshot);
  },
  deleteDatabase: () => {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is unavailable.");
    return createIndexedDbAdapter(globalThis.indexedDB).deleteDatabase();
  },
});

export const loadBatch = () => defaultStorage.loadBatch();
export const saveBatch = (snapshot, shouldSave) =>
  defaultStorage.saveBatch(snapshot, shouldSave);
export const clearBatch = () => defaultStorage.clearBatch();
