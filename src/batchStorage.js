import { sanitisePreferences } from "./preferences.js";

export const BATCH_DATABASE_NAME = "batch-image-resizer:batch:v1";
export const BATCH_DATABASE_VERSION = 2;
const STORE_NAME = "snapshots";
const SOURCES_STORE_NAME = "sources";
const SNAPSHOT_KEY = "current";

function storageError(action, error) {
  return new Error(
    `Could not ${action} saved batch: ${error?.name && error.name !== "Error" ? `${error.name}: ` : ""}${(error?.message || "storage is unavailable").replace(/[.\s]+$/, "")}`,
    {
      cause: error,
    },
  );
}

function requestPromise(request) {
  const result = new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB request failed."));
  });
  // Later request creation can throw before queued promises reach Promise.all.
  result.catch(() => {});
  return result;
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
      if (!database.objectStoreNames.contains(SOURCES_STORE_NAME))
        database.createObjectStore(SOURCES_STORE_NAME);
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
        let failure;
        try {
          transaction = database.transaction(
            [STORE_NAME, SOURCES_STORE_NAME],
            mode,
          );
          result = run(
            transaction.objectStore(STORE_NAME),
            transaction.objectStore(SOURCES_STORE_NAME),
          );
          // Abort on preparation failures too, so partial writes cannot commit.
          Promise.resolve(result).catch((error) => {
            failure ||= error;
            try {
              transaction.abort();
            } catch {
              // The request may already have aborted the transaction.
            }
          });
        } catch (error) {
          transaction?.abort();
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
        transaction.onerror = (event) => {
          failure ||= event.target?.error;
        };
        // Request errors bubble before transaction.error is populated.
        transaction.onabort = () => {
          if (settled) return;
          settled = true;
          database.close();
          reject(
            failure ||
              transaction.error ||
              new DOMException("IndexedDB transaction aborted", "AbortError"),
          );
        };
      }),
  );
}

export function createIndexedDbAdapter(indexedDB) {
  return {
    readSnapshot: async () => {
      if (
        typeof indexedDB.databases === "function" &&
        !(await indexedDB.databases()).some(
          ({ name }) => name === BATCH_DATABASE_NAME,
        )
      )
        return null;
      return withDatabase(indexedDB, "readonly", async (store, sources) => {
        const snapshot = await requestPromise(store.get(SNAPSHOT_KEY));
        if (snapshot?.storageVersion !== 2) return snapshot;
        const restored = await Promise.all(
          snapshot.sources.map(async (source) => {
            const bytes = await requestPromise(sources.get(source.id));
            if (!(bytes instanceof ArrayBuffer))
              throw new Error(`Saved image "${source.fileName}" is missing.`);
            return {
              ...source,
              file: new Blob([bytes], { type: source.fileType }),
            };
          }),
        );
        return { ...snapshot, sources: restored };
      });
    },
    writeSnapshot: async (snapshot, shouldSave = () => true) => {
      if (!shouldSave()) return;
      const savedIds = new Set(
        await withDatabase(indexedDB, "readonly", (_, sources) =>
          requestPromise(sources.getAllKeys()),
        ),
      );
      const bytes = new Map();
      // Read outside the transaction; file reads can outlive its active window.
      // Raw bytes also avoid browser-specific Blob persistence failures.
      // Source ids identify immutable imports; settings saves reuse their bytes.
      for (const source of snapshot.sources) {
        if (!savedIds.has(source.id))
          bytes.set(source.id, await source.file.arrayBuffer());
      }
      if (!shouldSave()) return;
      await withDatabase(indexedDB, "readwrite", async (store, sources) => {
        const currentIds = await requestPromise(sources.getAllKeys());
        if (!shouldSave()) return;
        const current = new Set(currentIds);
        const retained = new Set(snapshot.sources.map(({ id }) => id));
        const writes = [];
        for (const source of snapshot.sources) {
          if (!current.has(source.id) && !bytes.has(source.id))
            throw new DOMException(
              "Saved images changed in another tab; retrying the batch save",
              "AbortError",
            );
        }
        for (const source of snapshot.sources) {
          if (current.has(source.id)) continue;
          writes.push(
            requestPromise(sources.put(bytes.get(source.id), source.id)),
          );
        }
        for (const id of currentIds) {
          if (!retained.has(id))
            writes.push(requestPromise(sources.delete(id)));
        }
        writes.push(
          requestPromise(
            store.put(
              {
                ...snapshot,
                storageVersion: 2,
                sources: snapshot.sources.map(({ file, ...source }) => source),
              },
              SNAPSHOT_KEY,
            ),
          ),
        );
        await Promise.all(writes);
      });
    },
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
          const prepared = validateAndPrepareSnapshot(snapshot);
          try {
            await adapter.writeSnapshot(prepared, shouldSave);
          } catch (error) {
            if (!["AbortError", "UnknownError"].includes(error?.name))
              throw error;
            if (!shouldSave()) return;
            await adapter.writeSnapshot(prepared, shouldSave);
          }
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
  writeSnapshot: (snapshot, shouldSave) => {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is unavailable.");
    return createIndexedDbAdapter(globalThis.indexedDB).writeSnapshot(
      snapshot,
      shouldSave,
    );
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
