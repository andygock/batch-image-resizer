import { useEffect, useState } from "react";
import { createAlphaPreview } from "./alphaPreview.js";
import { OutputImage } from "./OutputImages.jsx";

export default function InspectorImage({
  blob,
  filename,
  width,
  height,
  alphaOnly,
}) {
  const [alpha, setAlpha] = useState(null);
  useEffect(() => {
    if (!alphaOnly) {
      setAlpha(null);
      return;
    }
    const controller = new AbortController();
    const identity = { source: blob, width, height };
    setAlpha(null);
    createAlphaPreview(blob, width, height, controller.signal).then(
      (preview) => {
        if (!controller.signal.aborted) setAlpha({ ...identity, preview });
      },
      (error) => {
        if (!controller.signal.aborted)
          setAlpha({ ...identity, error: error.message });
      },
    );
    return () => controller.abort();
  }, [blob, width, height, alphaOnly]);
  if (!alphaOnly)
    return (
      <OutputImage
        blob={blob}
        filename={filename}
        width={width}
        height={height}
      />
    );
  const current =
    alpha?.source === blob && alpha.width === width && alpha.height === height
      ? alpha
      : null;
  if (!current?.preview)
    return (
      <p role="status">
        {current?.error
          ? `Alpha preview unavailable: ${current.error}`
          : "Preparing alpha preview…"}
      </p>
    );
  return (
    <OutputImage
      blob={current.preview}
      filename={`Alpha channel · ${filename}`}
      width={width}
      height={height}
    />
  );
}
