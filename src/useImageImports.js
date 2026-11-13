import { useCallback, useEffect, useRef, useState } from "react";
import { partitionImageFiles } from "./imageFiles.js";

export default function useImageImports(
  onImport,
  images,
  getRetainedFiles = () => [],
) {
  const current = useRef({ onImport, images, getRetainedFiles });
  current.current = { onImport, images, getRetainedFiles };
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const controller = useRef(new AbortController());
  useEffect(
    () => () => {
      generation.current++;
      controller.current.abort();
    },
    [],
  );
  const pending = useRef(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({
    completed: 0,
    total: 0,
    filename: "",
  });
  const [errors, setErrors] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const notifications = useRef({ errors: [], duplicates: [] });
  const verified = useRef(new WeakMap());
  const retainedRequests = useRef(new Map());
  const dismissDuplicates = useCallback(() => {
    notifications.current.duplicates = [];
    setDuplicates([]);
  }, []);
  const clearErrors = useCallback(() => {
    notifications.current.errors = [];
    setErrors([]);
  }, []);
  const addFiles = useCallback((files, allowDuplicates = false) => {
    const incoming = Array.from(files);
    if (!incoming.length) return;
    const request = generation.current;
    const signal = controller.current.signal;
    const reservation = Symbol();
    retainedRequests.current.set(
      reservation,
      incoming.filter((file) => verified.current.has(file)),
    );
    pending.current++;
    setIsImporting(true);
    queue.current = queue.current
      .then(async () => {
        if (request !== generation.current) return;
        await partitionImageFiles(incoming, current.current.images, {
          allowDuplicates,
          signal,
          getExistingSources: () => current.current.images,
          getRetainedFiles: () => [
            ...current.current.getRetainedFiles(),
            ...notifications.current.duplicates,
            ...[...retainedRequests.current.values()].flat(),
          ],
          // Reuse immutable copies already validated by this import session.
          getVerifiedSource: (file) => verified.current.get(file),
          onAccepted: (source) => {
            if (request !== generation.current) return;
            current.current.images = [...current.current.images, source];
            current.current.onImport([source]);
          },
          onDuplicate: (file, source) => {
            if (request !== generation.current) return;
            verified.current.set(file, source);
            notifications.current.duplicates = [
              ...notifications.current.duplicates,
              file,
            ];
            setDuplicates(notifications.current.duplicates);
          },
          onError: ({ message }) => {
            if (request !== generation.current) return;
            notifications.current.errors = [
              ...notifications.current.errors,
              message,
            ];
            setErrors(notifications.current.errors);
          },
          onProgress: (progress) => {
            if (request === generation.current) setImportProgress(progress);
          },
        });
      })
      .catch((error) => {
        if (request === generation.current) {
          notifications.current.errors = [
            ...notifications.current.errors,
            `Could not add images: ${error.message}`,
          ];
          setErrors(notifications.current.errors);
        }
      })
      .finally(() => {
        retainedRequests.current.delete(reservation);
        if (request === generation.current) {
          pending.current--;
          setIsImporting(pending.current > 0);
        }
      });
  }, []);
  const cancelImports = useCallback(() => {
    generation.current++;
    controller.current.abort();
    controller.current = new AbortController();
    queue.current = Promise.resolve();
    pending.current = 0;
    setIsImporting(false);
    setErrors([]);
    setDuplicates([]);
    notifications.current = { errors: [], duplicates: [] };
    retainedRequests.current.clear();
  }, []);
  return {
    addFiles,
    cancelImports,
    isImporting,
    importProgress,
    errors,
    duplicates,
    dismissDuplicates,
    clearErrors,
  };
}
