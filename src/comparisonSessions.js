export const MAX_COMPARISON_SESSIONS = 8;
export const MAX_COMPARISON_BYTES = 64 * 1024 * 1024;

// Session-only LRU storage. Count shared output blobs once, including A/B reuse.
export function createComparisonSessions({
  maxEntries = MAX_COMPARISON_SESSIONS,
  maxBytes = MAX_COMPARISON_BYTES,
} = {}) {
  const entries = new Map();
  const bytes = () =>
    [
      ...new Set(
        [...entries.values()]
          .flatMap((entry) => [
            entry.result?.blob,
            entry.candidateA?.result?.blob,
          ])
          .filter(Boolean),
      ),
    ].reduce((sum, blob) => sum + blob.size, 0);
  return {
    get(id) {
      const value = entries.get(id);
      if (value) {
        entries.delete(id);
        entries.set(id, value);
      }
      return value;
    },
    set(id, value) {
      entries.delete(id);
      const ownBytes = [
        ...new Set(
          [value.result?.blob, value.candidateA?.result?.blob].filter(Boolean),
        ),
      ].reduce((sum, blob) => sum + blob.size, 0);
      entries.set(
        id,
        ownBytes > maxBytes
          ? { ...value, result: null, candidateA: null, compareOutputs: false }
          : value,
      );
      while (
        entries.size > 1 &&
        (entries.size > maxEntries || bytes() > maxBytes)
      )
        entries.delete(entries.keys().next().value);
    },
    remove(ids) {
      for (const id of ids) entries.delete(id);
    },
    clear() {
      entries.clear();
    },
  };
}
