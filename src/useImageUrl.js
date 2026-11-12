import { useEffect, useState } from "react";
import { decodeImage } from "./decodeImage.js";
import { validateSourceDimensions } from "./imageLimits.js";
import { needsStaticPreview } from "./inputFormats.js";

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
    if (fallbackFor !== blob && !needsStaticPreview(blob.type)) return;
    const controller = new AbortController();
    let url;
    void (async () => {
      let decoded;
      try {
        decoded = await decodeImage(blob, controller.signal);
        const canvas = new OffscreenCanvas(decoded.width, decoded.height);
        let png;
        try {
          canvas.getContext("2d").drawImage(decoded.image, 0, 0);
          png = await canvas.convertToBlob({ type: "image/png" });
        } finally {
          canvas.width = canvas.height = 0;
        }
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
    previewUrl:
      fallback?.blob === blob && fallback.url
        ? fallback.url
        : needsStaticPreview(blob.type)
          ? ""
          : url,
    error: fallback?.blob === blob ? fallback.error : "",
    onLoad: (event) => {
      try {
        validateSourceDimensions(
          event.currentTarget.naturalWidth,
          event.currentTarget.naturalHeight,
        );
      } catch (error) {
        event.currentTarget.removeAttribute("src");
        setFallback({ blob, error: `Preview unavailable: ${error.message}` });
      }
    },
    onError: () => {
      if (blob.type === "image/avif" && fallbackFor !== blob)
        setFallbackFor(blob);
    },
  };
}
