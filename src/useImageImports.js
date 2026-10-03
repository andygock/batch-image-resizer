import { useCallback, useRef, useState } from "react";
import { partitionImageFiles } from "./imageFiles.js";

export default function useImageImports(onImport, images) {
  const current = useRef({ onImport, images });
  current.current = { onImport, images };
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const pending = useRef(0);
  const [isImporting, setIsImporting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const addFiles = useCallback((files, allowDuplicates = false) => {
    const incoming = Array.from(files);
    if (!incoming.length) return;
    const request = generation.current;
    pending.current++;
    setIsImporting(true);
    queue.current = queue.current
      .then(async () => {
        if (request !== generation.current) return;
        const result = await partitionImageFiles(
          incoming,
          current.current.images,
          { allowDuplicates },
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
    pending.current = 0;
    setIsImporting(false);
    setErrors([]);
    setDuplicates([]);
  }, []);
  return {
    addFiles,
    cancelImports,
    isImporting,
    errors,
    duplicates,
    dismissDuplicates: () => setDuplicates([]),
    clearErrors: () => setErrors([]),
  };
}
