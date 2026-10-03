import { useLayoutEffect, useRef, useState } from "react";
import { createBatchProcessor } from "./batchProcessor.js";

export default function useBatchProcessor(
  images,
  settings,
  paused = false,
  attempt = { ids: [] },
) {
  const processor = useRef(null);
  if (!processor.current) processor.current = createBatchProcessor();
  const [state, setState] = useState({
    records: {},
    isProcessing: false,
    progress: 0,
    processingTime: 0,
  });
  const lastAttempt = useRef(null);
  useLayoutEffect(() => {
    const current = processor.current;
    const retryIds = lastAttempt.current === attempt ? [] : attempt.ids;
    lastAttempt.current = attempt;
    void current.run(images, settings, { paused, retryIds }, setState);
    return () => current.cancel();
  }, [images, settings, paused, attempt]);
  return { ...state, processor: processor.current };
}
