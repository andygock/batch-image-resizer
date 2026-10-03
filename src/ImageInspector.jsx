import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-preact";
import CompressionSelect from "./CompressionSelect.jsx";
import OutputFormatSelect from "./OutputFormatSelect.jsx";
import { OutputImage, formatKb } from "./OutputImages.jsx";
import { resolveSettings, settingsKey } from "./batchProcessor.js";
import styles from "./ImageInspector.module.css";

export default function ImageInspector({
  source,
  batchResult,
  settings,
  processor,
  index,
  total,
  onNavigate,
  onClose,
  onApply,
}) {
  const [draft, setDraft] = useState(settings);
  const [preview, setPreview] = useState({
    result: batchResult,
    busy: false,
    error: "",
  });
  const [compareWith, setCompareWith] = useState("original");
  const [actualSize, setActualSize] = useState(false);
  const panel = useRef(null);
  const title = useRef(null);
  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const key = settingsKey(resolveSettings(source, draft));
    if (batchResult && settingsKey(batchResult.settings) === key) {
      setPreview({ result: batchResult, busy: false, error: "" });
      return () => controller.abort();
    }
    setPreview((current) => ({
      result: current.result?.id === source.id ? current.result : batchResult,
      busy: true,
      error: "",
    }));
    const timer = setTimeout(async () => {
      try {
        const result = await processor.preview(
          source,
          draft,
          controller.signal,
        );
        if (!controller.signal.aborted)
          setPreview({ result, busy: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setPreview((current) => ({
            ...current,
            busy: false,
            error: error.message,
          }));
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [source, draft, processor, batchResult]);
  const result =
    preview.result?.id === source.id ? preview.result : batchResult;
  const previous = result
    ? processor.previous(source.id, settingsKey(result.settings))
    : undefined;
  const before = compareWith === "previous" && previous ? previous : null;
  const changed =
    draft.format !== settings.format ||
    draft.colours !== settings.colours ||
    JSON.stringify(draft.qualityByFormat) !==
      JSON.stringify(settings.qualityByFormat);

  return (
    <aside
      className={styles.inspector}
      ref={panel}
      aria-label="Image comparison"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
        if (event.target.closest?.("input, select, textarea")) return;
        if (event.key === "ArrowLeft" && index > 0) {
          event.preventDefault();
          onNavigate(-1);
        }
        if (event.key === "ArrowRight" && index < total - 1) {
          event.preventDefault();
          onNavigate(1);
        }
      }}
    >
      <div className={styles.controls}>
        <button
          onClick={() => onNavigate(-1)}
          disabled={index === 0}
          aria-label="Previous image"
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {index + 1} / {total}
        </span>
        <button
          onClick={() => onNavigate(1)}
          disabled={index === total - 1}
          aria-label="Next image"
        >
          <ChevronRight size={16} />
        </button>
        <button onClick={onClose} aria-label="Close comparison">
          <X size={16} />
        </button>
      </div>
      <h2 ref={title} tabIndex={-1}>
        {source.file.name}
      </h2>
      <div className={styles.controls}>
        <label>
          Compare with{" "}
          <select
            value={compareWith}
            onChange={(event) => setCompareWith(event.target.value)}
          >
            <option value="original">Original</option>
            <option value="previous" disabled={!previous}>
              Previous version
            </option>
          </select>
        </label>
        <button
          aria-pressed={actualSize}
          onClick={() => setActualSize(!actualSize)}
        >
          {actualSize ? "Fit previews" : "View at 100%"}
        </button>
      </div>
      <div
        className={`${styles.comparison} ${actualSize ? styles.actualSize : ""}`}
      >
        <figure>
          <figcaption>
            {before ? "Previous" : "Original"} ·{" "}
            {formatKb(before?.filesizeAfter ?? source.file.size)}
          </figcaption>
          <div>
            <OutputImage
              blob={before?.blob ?? source.file}
              filename={`Original ${source.file.name}`}
              width={before?.widthAfter}
              height={before?.heightAfter}
            />
          </div>
        </figure>
        <figure>
          <figcaption>
            {changed ? "Trial output" : "Output"}
            {result
              ? ` · ${formatKb(result.filesizeAfter)} · ${result.widthAfter}×${result.heightAfter}px`
              : ""}
          </figcaption>
          <div>
            {result ? (
              <OutputImage
                blob={result.blob}
                filename={`Output ${source.file.name}`}
                width={result.widthAfter}
                height={result.heightAfter}
              />
            ) : (
              <p>No preview yet.</p>
            )}
          </div>
        </figure>
      </div>
      <div className={styles.controls}>
        <OutputFormatSelect
          id="trial-format"
          value={draft.format}
          onChange={(format) => setDraft({ ...draft, format })}
        />
        <CompressionSelect
          idPrefix="trial-"
          format={draft.format}
          sourceFormats={[source.sourceFormat]}
          qualityByFormat={draft.qualityByFormat}
          onQualityChange={(format, quality) =>
            setDraft({
              ...draft,
              qualityByFormat: { ...draft.qualityByFormat, [format]: quality },
            })
          }
          pngColors={draft.colours}
          onPngColorsChange={(colours) => setDraft({ ...draft, colours })}
        />
        <button
          disabled={!changed || preview.busy || Boolean(preview.error)}
          onClick={() => onApply(draft)}
        >
          Apply to batch
        </button>
        {changed && (
          <button onClick={() => setDraft(settings)}>Revert trial</button>
        )}
      </div>
      <p className={styles.feedback} role="status">
        {preview.busy
          ? "Updating this image only… Previous preview remains visible."
          : preview.error
            ? `${preview.error} Try a different format or a smaller batch size.`
            : changed
              ? "Trial settings affect only this preview until applied."
              : "Compare quality here without changing the batch."}
      </p>
      {result?.encodingWarning && <p>{result.encodingWarning}</p>}
      {draft.format === "jpeg" && <p>JPEG makes transparent areas white.</p>}
    </aside>
  );
}
