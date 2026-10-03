import { useLayoutEffect, useRef, useState } from "react";
import { createBatchProcessor } from "./batchProcessor.js";

export default function useBatchProcessor(images, settings, paused = false, attempt = { ids: [] }) {
  const processor = useRef(null);
  if (!processor.current) processor.current = createBatchProcessor();
  const [state, setState] = useState({ records: {}, isProcessing: false, progress: 0, processingTime: 0 });
  useLayoutEffect(() => {
    const current = processor.current;
    void current.run(images, settings, { paused, retryIds: attempt.ids }, setState);
    return () => current.cancel();
  }, [images, settings, paused, attempt]);
  return { ...state, processor: processor.current };
}
