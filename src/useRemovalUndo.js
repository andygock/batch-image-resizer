import { useCallback, useEffect, useRef, useState } from "react";

export const UNDO_TIMEOUT_MS = 30_000;

export function restoreImageOrder(current, snapshot) {
  const available = new Map(
    [...current, ...snapshot.images].map((image) => [image.id, image]),
  );
  const ordered = snapshot.order.flatMap((id) =>
    available.has(id) ? [available.get(id)] : [],
  );
  const previous = new Set(snapshot.order);
  return [...ordered, ...current.filter(({ id }) => !previous.has(id))];
}

export default function useRemovalUndo(onDiscard) {
  const [snapshot, setSnapshot] = useState(null);
  const latest = useRef(null);
  const timer = useRef(null);
  const notify = useRef(onDiscard);
  notify.current = onDiscard;
  const discard = useCallback(() => {
    clearTimeout(timer.current);
    if (latest.current) notify.current?.();
    latest.current = null;
    setSnapshot(null);
  }, []);
  const remember = useCallback(
    (value) => {
      clearTimeout(timer.current);
      latest.current = value;
      setSnapshot(value);
      timer.current = setTimeout(discard, UNDO_TIMEOUT_MS);
    },
    [discard],
  );
  const take = useCallback(() => {
    const value = latest.current;
    discard();
    return value;
  }, [discard]);
  const getFiles = useCallback(
    () => latest.current?.images.map(({ file }) => file) ?? [],
    [],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return { snapshot, remember, take, discard, getFiles };
}
