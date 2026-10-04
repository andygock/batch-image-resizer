import { useEffect, useState } from "react";
import { decodeAvifImage } from "./decodeAvifImage.js";

export default function useImageUrl(blob) {
  const [original, setOriginal] = useState(null);
  const [fallbackFor, setFallbackFor] = useState(null);
  const [fallback, setFallback] = useState(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setOriginal({ blob, url });
    setFallbackFor((current) => (current === blob ? current : null));
    setFallback((current) => (current?.blob === blob ? current : null));
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  useEffect(() => {
    if (fallbackFor !== blob) return;
    const controller = new AbortController();
    let url;
    void (async () => {
      let decoded;
      try {
        decoded = await decodeAvifImage(blob, controller.signal);
        const png = await decoded.image.convertToBlob({ type: "image/png" });
        controller.signal.throwIfAborted();
        url = URL.createObjectURL(png);
        setFallback({ blob, url });
      } catch (error) {
        if (!controller.signal.aborted)
          setFallback({ blob, error: `Preview unavailable: ${error.message}` });
      } finally {
        decoded?.close();
      }
    })();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob, fallbackFor]);
  const url = original?.blob === blob ? original.url : "";
  return {
    url,
    previewUrl: fallback?.blob === blob && fallback.url ? fallback.url : url,
    error: fallback?.blob === blob ? fallback.error : "",
    onError: () => {
      if (blob.type === "image/avif" && fallbackFor !== blob)
        setFallbackFor(blob);
    },
  };
}
