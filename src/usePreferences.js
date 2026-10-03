import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearPreferences,
  loadPreferences,
  savePreferences,
  sanitisePreferences,
} from "./preferences.js";
import {
  clearAppWebStorage,
  readStoragePolicy,
  writeStoragePolicy,
} from "./storagePrivacy.js";

export default function usePreferences() {
  const [preferences, setPreferences] = useState(() => ({
    ...loadPreferences(),
    ...readStoragePolicy(),
  }));
  const initial = useRef(preferences);
  const suppressPolicy = useRef(false);
  const previousPolicy = useRef({
    rememberPreferences: preferences.rememberPreferences,
    rememberBatch: preferences.rememberBatch,
  });
  const [storageError, setStorageError] = useState("");
  const { rememberPreferences, rememberBatch } = preferences;
  useEffect(() => {
    if (preferences === initial.current || !preferences.rememberPreferences)
      return;
    try {
      savePreferences(preferences);
      setStorageError("");
    } catch (error) {
      setStorageError(
        `${error.message}. Your current settings still work in this tab.`,
      );
    }
  }, [preferences]);
  useEffect(() => {
    const previous = previousPolicy.current;
    previousPolicy.current = { rememberPreferences, rememberBatch };
    if (
      suppressPolicy.current ||
      (rememberPreferences === previous.rememberPreferences &&
        rememberBatch === previous.rememberBatch)
    )
      return;
    try {
      writeStoragePolicy({ rememberPreferences, rememberBatch });
    } catch (error) {
      setStorageError(`Could not save storage choices: ${error.message}`);
    }
  }, [rememberPreferences, rememberBatch]);
  const setPreference = useCallback((key, value) => {
    if (key === "rememberPreferences" || key === "rememberBatch")
      suppressPolicy.current = false;
    setPreferences((current) => {
      const next = { ...current, [key]: value };
      if (key === "boundingBox")
        next.recentSizes = [value, ...current.recentSizes];
      const clean = sanitisePreferences(next);
      // Naming and storage preferences must not restart active image processing.
      if (key !== "boundingBox") clean.boundingBox = current.boundingBox;
      if (key !== "qualityByFormat")
        clean.qualityByFormat = current.qualityByFormat;
      return clean;
    });
  }, []);
  const forgetPreferences = useCallback(() => {
    suppressPolicy.current = false;
    setPreferences((current) => ({ ...current, rememberPreferences: false }));
    try {
      clearPreferences();
      setStorageError("");
      return true;
    } catch (error) {
      setStorageError(error.message);
      return false;
    }
  }, []);
  const pauseStorage = useCallback((kind) => {
    if (kind === "local" || kind === "all") suppressPolicy.current = true;
    setPreferences((current) => ({
      ...current,
      rememberPreferences:
        kind === "batch" ? current.rememberPreferences : false,
      rememberBatch:
        kind === "all" || kind === "batch" ? false : current.rememberBatch,
    }));
  }, []);
  const clearLocalData = useCallback(() => {
    pauseStorage("local");
    try {
      clearAppWebStorage("local");
      setStorageError("");
      return true;
    } catch (error) {
      setStorageError(`Could not clear Local Storage: ${error.message}`);
      return false;
    }
  }, [pauseStorage]);
  const restorePreferences = useCallback((value) => {
    initial.current = value;
    setPreferences(value);
  }, []);
  return {
    preferences,
    setPreference,
    restorePreferences,
    applyPreferences: setPreferences,
    forgetPreferences,
    pauseStorage,
    clearLocalData,
    storageError,
  };
}
