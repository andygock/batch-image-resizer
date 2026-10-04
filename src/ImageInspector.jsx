import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-preact";
import CompressionSelect from "./CompressionSelect.jsx";
import OutputFormatSelect from "./OutputFormatSelect.jsx";
import { OutputImage, formatKb } from "./OutputImages.jsx";
import { resolveSettings, settingsKey } from "./batchProcessor.js";
import styles from "./ImageInspector.module.css";
import useImagePan from "./useImagePan.js";
import Modal from "./Modal.jsx";

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
  const [split, setSplit] = useState(50);
  const comparison = useRef(null);
  const slider = useRef(null);
  const drag = useRef(null);
  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    setSplit(50);
  }, [source.id]);
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
  const viewport = useImagePan(actualSize, source.id, result ? split : 100);
  const changed =
    draft.format !== settings.format ||
    draft.colours !== settings.colours ||
    JSON.stringify(draft.qualityByFormat) !==
      JSON.stringify(settings.qualityByFormat);
  const moveSlider = (event) => {
    const bounds = comparison.current.getBoundingClientRect();
    if (bounds.width)
      setSplit(
        Math.max(
          0,
          Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100),
        ),
      );
  };
  const stopSlider = (event) => {
    if (drag.current !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <Modal
      title="Image comparison"
      onClose={onClose}
      className={styles.inspector}
      onKeyDown={(event) => {
        if (event.target.closest?.('input, select, textarea, [role="slider"]'))
          return;
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
      <div className={styles.toolbar}>
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
          <h3>{source.file.name}</h3>
        </div>
        <div className={`${styles.controls} ${styles.compareControls}`}>
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
      </div>
      <div>
        <div className={styles.captions}>
          <span>
            {before ? "Previous" : "Original"} ·{" "}
            {formatKb(before?.filesizeAfter ?? source.file.size)}
          </span>
          <span>
            {changed ? "Trial output" : "Output"}
            {result
              ? ` · ${formatKb(result.filesizeAfter)} · ${result.widthAfter}×${result.heightAfter}px`
              : ""}
          </span>
        </div>
        <div
          ref={comparison}
          className={`${styles.comparison} ${actualSize ? styles.actualSize : ""}`}
          style={{ "--split": `${result ? split : 100}%` }}
          onPointerDown={(event) => {
            if (!result || event.button !== 0 || drag.current !== null) return;
            if (actualSize && !event.target.closest?.('[role="slider"]')) return;
            event.preventDefault();
            slider.current.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = event.pointerId;
            moveSlider(event);
          }}
          onPointerMove={(event) => {
            if (event.pointerId === drag.current) moveSlider(event);
          }}
          onPointerUp={stopSlider}
          onPointerCancel={stopSlider}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <div
            ref={viewport}
            className={styles.imageViewport}
            title={actualSize ? "Drag to pan both images" : undefined}
          >
            <div
              className={styles.imageCanvas}
              style={
                actualSize && result
                  ? {
                      width: `${result.widthAfter}px`,
                      height: `${result.heightAfter}px`,
                    }
                  : undefined
              }
            >
              <div className={styles.imageLayer}>
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
              <div className={`${styles.imageLayer} ${styles.before}`}>
                <OutputImage
                  blob={before?.blob ?? source.file}
                  filename={`${before ? "Previous" : "Original"} ${source.file.name}`}
                  width={result?.widthAfter}
                  height={result?.heightAfter}
                />
              </div>
            </div>
          </div>
          {result && (
            <button
              ref={slider}
              className={styles.slider}
              type="button"
              role="slider"
              aria-label="Image comparison slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split)}
              aria-valuetext={`${Math.round(split)}% ${before ? "previous" : "original"} visible`}
              aria-orientation="horizontal"
              onKeyDown={(event) => {
                const steps = {
                  ArrowLeft: -1,
                  ArrowDown: -1,
                  ArrowRight: 1,
                  ArrowUp: 1,
                  PageDown: -10,
                  PageUp: 10,
                };
                if (event.key === "Home") setSplit(0);
                else if (event.key === "End") setSplit(100);
                else if (event.key in steps)
                  setSplit((current) =>
                    Math.max(0, Math.min(100, current + steps[event.key])),
                  );
                else return;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <span className={styles.handle} aria-hidden="true">
                <ChevronLeft size={18} />
                <ChevronRight size={18} />
              </span>
            </button>
          )}
        </div>
        <p className={styles.hint}>
          {actualSize
            ? "Drag the divider to compare. Drag an image to pan, or scroll."
            : "Drag the divider to compare, or use the arrow keys when focused."}
        </p>
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
    </Modal>
  );
}
