export function createResultCache({
  maxBytes = 96 * 1024 * 1024,
  maxEntries = 160,
} = {}) {
  const entries = new Map();
  let bytes = 0;
  const token = (id, key) => JSON.stringify([id, key]);
  const remove = (name) => {
    const entry = entries.get(name);
    if (entry) bytes -= entry.result.blob?.size ?? 0;
    entries.delete(name);
  };
  const set = (id, key, result) => {
    const name = token(id, key);
    remove(name);
    entries.set(name, { id, key, result });
    bytes += result.blob?.size ?? 0;
    while (entries.size > maxEntries || bytes > maxBytes)
      remove(entries.keys().next().value);
  };
  return {
    set,
    get(id, key) {
      const name = token(id, key);
      const entry = entries.get(name);
      if (!entry) return undefined;
      entries.delete(name);
      entries.set(name, entry);
      return entry.result;
    },
    previous(id, key) {
      return [...entries.values()]
        .reverse()
        .find((entry) => entry.id === id && entry.key !== key)?.result;
    },
    retain(ids) {
      for (const [name, entry] of entries) if (!ids.has(entry.id)) remove(name);
    },
    clear() {
      entries.clear();
      bytes = 0;
    },
  };
}
