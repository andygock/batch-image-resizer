import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearPreferences,
  loadPreferences,
  sanitisePreferences,
  savePreferences,
} from "./preferences.js";

export default function usePreferences() {
  const [preferences, setPreferences] = useState(loadPreferences);
  const initial = useRef(preferences);
  const savingPaused = useRef(false);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    if (preferences === initial.current || savingPaused.current) return;
    try {
      savePreferences(preferences);
      setStorageError("");
    } catch (error) {
      setStorageError(
        `${error.message}. Your current settings still work in this tab.`,
      );
    }
  }, [preferences]);
  const setPreference = useCallback((key, value) => {
    if (key === "rememberPreferences") savingPaused.current = false;
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
    savingPaused.current = true;
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
  return {
    preferences,
    setPreference,
    applyPreferences: setPreferences,
    forgetPreferences,
    storageError,
  };
}
