import { useCallback, useEffect, useRef, useState } from "react";
import { clearBatch, loadBatch, saveBatch } from "./batchStorage.js";

export default function useBatchRecovery(images, preferences, onRestore, setPreference, paused = false, selectedIds = []) {
  const latest = useRef({ images, preferences, onRestore });
  latest.current = { images, preferences, onRestore };
  const activity = useRef(0);
  const saving = useRef(preferences.rememberBatch);
  const timer = useRef(null);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const markChanged = useCallback(() => { activity.current++; }, []);

  useEffect(() => {
    let mounted = true;
    const revision = activity.current;
    const restore = async () => {
      try {
        if (!latest.current.preferences.rememberBatch) return;
        const saved = await loadBatch();
        if (mounted && revision === activity.current && saved?.sources.length) {
          latest.current.onRestore(saved);
          setMessage(`Restored ${saved.sources.length} images from this device.`);
        }
      } catch (failure) {
        if (mounted) setError(`${failure.message}. You can keep working or clear saved batch data below.`);
      } finally {
        if (mounted) setHydrated(true);
      }
    };
    void restore();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    saving.current = preferences.rememberBatch;
    if (!hydrated || !saving.current || activity.current === 0) return;
    const revision = activity.current;
    timer.current = setTimeout(async () => {
      if (!saving.current || revision !== activity.current) return;
      try {
        if (images.length) await saveBatch({ sources: images, preferences, paused, selectedIds }, () => saving.current && revision === activity.current);
        else await clearBatch();
        if (saving.current && revision === activity.current) {
          setError("");
          setMessage(images.length ? "Batch saved on this device." : "Saved batch cleared.");
        }
      } catch (failure) {
        if (saving.current) setError(`${failure.message}. Keep this tab open to retain the current batch.`);
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [images, preferences, hydrated, paused, selectedIds]);

  const pauseSaving = useCallback(() => {
    saving.current = false;
    activity.current++;
    clearTimeout(timer.current);
  }, []);
  const forgetBatch = useCallback(async (updatePreference = true) => {
    pauseSaving();
    if (updatePreference) setPreference("rememberBatch", false);
    try {
      await clearBatch();
      setError("");
      setMessage("Saved batch deleted. Batch saving is off; current images remain in this tab.");
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    }
  }, [setPreference, pauseSaving]);

  return { markChanged, forgetBatch, pauseSaving, hydrated, message, error };
}
