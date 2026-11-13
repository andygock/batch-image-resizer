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
  const addFiles = useCallback((files, allowDuplicates = false) => {
    const incoming = Array.from(files);
    if (!incoming.length) return;
    const request = generation.current;
    const signal = controller.current.signal;
    pending.current++;
    setIsImporting(true);
    setDuplicates([]);
    queue.current = queue.current
      .then(async () => {
        if (request !== generation.current) return;
        const result = await partitionImageFiles(
          incoming,
          current.current.images,
          {
            allowDuplicates,
            signal,
            getExistingSources: () => current.current.images,
            getRetainedFiles: () => current.current.getRetainedFiles(),
            onProgress: (progress) => {
              if (request === generation.current) setImportProgress(progress);
            },
          },
        );
        if (request !== generation.current) return;
        setErrors(result.errors.map(({ message }) => message));
        setDuplicates(result.duplicateFiles);
        if (result.accepted.length) {
          current.current.images = [
            ...current.current.images,
            ...result.accepted,
          ];
          current.current.onImport(result.accepted);
        }
      })
      .catch((error) => {
        if (request === generation.current)
          setErrors([`Could not add images: ${error.message}`]);
      })
      .finally(() => {
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
  }, []);
  return {
    addFiles,
    cancelImports,
    isImporting,
    importProgress,
    errors,
    duplicates,
    dismissDuplicates: () => setDuplicates([]),
    clearErrors: () => setErrors([]),
  };
}
