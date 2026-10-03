export function updateSelection(selected, ids, anchor, id, extend) {
  const next = new Set(selected);
  const shouldSelect = !next.has(id);
  const start = ids.indexOf(anchor);
  const end = ids.indexOf(id);
  const targets = extend && start >= 0 && end >= 0
    ? ids.slice(Math.min(start, end), Math.max(start, end) + 1) : [id];
  for (const target of targets) {
    if (shouldSelect) next.add(target);
    else next.delete(target);
  }
  return next;
}
