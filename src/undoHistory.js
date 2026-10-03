export function restoreRemovedSources(current, removed) {
  const restored = [...current];
  const ids = new Set(current.map(({ id }) => id));
  for (const { source, index } of [...removed].sort((a, b) => a.index - b.index)) {
    if (!ids.has(source.id)) {
      restored.splice(Math.min(index, restored.length), 0, source);
      ids.add(source.id);
    }
  }
  return restored;
}

export function appendUndo(history, entry) {
  const next = [...history, entry];
  const bytes = (item) => {
    const blobs = new Set(item.outputs.flatMap(({ record, cached }) => [record?.result?.blob, ...(cached ?? []).map(({ result }) => result.blob)]).filter(Boolean));
    return item.removed.reduce((sum, { source }) => sum + source.file.size, 0)
      + [...blobs].reduce((sum, blob) => sum + blob.size, 0);
  };
  let total = next.reduce((sum, item) => sum + bytes(item), 0);
  // Keep the latest action undoable even when a single batch exceeds the budget.
  while (next.length > 1 && (next.length > 20 || total > 128 * 1024 * 1024)) total -= bytes(next.shift());
  return next;
}
