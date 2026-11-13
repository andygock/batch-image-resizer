import { ChevronLeft, ChevronRight } from "lucide-preact";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import AdvancedSettings from "./AdvancedSettings.jsx";
import { resolveSettings, settingsKey } from "./batchProcessor.js";
import CompressionSelect from "./CompressionSelect.jsx";
import { formatKb } from "./formatBytes.js";
import styles from "./ImageInspector.module.css";
import InspectorImage from "./InspectorImage.jsx";
import Modal from "./Modal.jsx";
import OutputFormatSelect from "./OutputFormatSelect.jsx";
import useImagePan from "./useImagePan.js";

function ComparisonContent({
  source,
  batchResult,
  settings,
  processor,
  index,
  total,
  onNavigate,
  onApply,
  sessions,
  saved,
  isOpen,
}) {
  const [draft, setDraft] = useState(() =>
    saved?.draft
      ? {
          ...saved.draft,
          bounds: settings.bounds,
          disableUpscale: settings.disableUpscale,
        }
      : settings,
  );
  const [preview, setPreview] = useState({
    result: saved?.result ?? batchResult,
    busy: false,
    error: "",
  });
  const [actualSize, setActualSize] = useState(saved?.actualSize ?? false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [candidateA, setCandidateA] = useState(saved?.candidateA ?? null);
  const [compareOutputs, setCompareOutputs] = useState(
    saved?.compareOutputs ?? false,
  );
  const [split, setSplit] = useState(saved?.split ?? 50);
  const [background, setBackground] = useState(
    saved?.background ?? "checkerboard",
  );
  const [customBackground, setCustomBackground] = useState(
    saved?.customBackground ?? "#808080",
  );
  const [alphaOnly, setAlphaOnly] = useState(saved?.alphaOnly ?? false);
  const [pan, setPan] = useState(saved?.pan ?? { left: 0, top: 0 });
  const [scrollTop, setScrollTop] = useState(saved?.scrollTop ?? 0);
  const comparison = useRef(null);
  const slider = useRef(null);
  const drag = useRef(null);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const dialog = comparison.current.closest("dialog");
    dialog.scrollTop = saved?.scrollTop ?? 0;
    const rememberScroll = () => setScrollTop(dialog.scrollTop);
    dialog.addEventListener("scroll", rememberScroll);
    return () => dialog.removeEventListener("scroll", rememberScroll);
  }, [saved?.scrollTop, isOpen]);
  const previousSettings = useRef(settings);
  useEffect(() => {
    if (previousSettings.current !== settings) setDraft(settings);
    previousSettings.current = settings;
  }, [settings]);
  useLayoutEffect(() => {
    sessions.set(source.id, {
      draft,
      result: preview.result,
      actualSize,
      candidateA,
      compareOutputs,
      split,
      background,
      customBackground,
      alphaOnly,
      pan,
      scrollTop,
    });
  }, [
    sessions,
    source.id,
    draft,
    preview.result,
    actualSize,
    candidateA,
    compareOutputs,
    split,
    background,
    customBackground,
    alphaOnly,
    pan,
    scrollTop,
  ]);
  useEffect(() => {
    const controller = new AbortController();
    const key = settingsKey(resolveSettings(source, draft));
    const matching = [batchResult, saved?.result].find(
      (result) => result && settingsKey(result.settings) === key,
    );
    if (matching) {
      setPreview({ result: matching, busy: false, error: "" });
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
  }, [source, draft, processor, batchResult, saved?.result]);
  const result =
    preview.result?.id === source.id ? preview.result : batchResult;
  const savedA = candidateA?.result.id === source.id ? candidateA : null;
  const leftOutput = compareOutputs ? savedA?.result : null;
  const currentResult =
    result &&
    settingsKey(result.settings) ===
      settingsKey(resolveSettings(source, draft));
  const details = (output) =>
    `${output.settings?.format?.toUpperCase() || ""} · ${formatKb(output.filesizeAfter)} · ${output.widthAfter}×${output.heightAfter}px${Number.isFinite(output.encodingTimeMs) ? ` · ${(output.encodingTimeMs / 1000).toFixed(2)} s encoding` : ""}`;
  const viewport = useImagePan(
    actualSize,
    source.id,
    result ? split : 100,
    pan,
    setPan,
    isOpen,
  );
  const changed =
    JSON.stringify(draft.processing) !== JSON.stringify(settings.processing) ||
    JSON.stringify(draft.advanced) !== JSON.stringify(settings.advanced) ||
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
    <>
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
        </div>
        <h3 className={styles.filename}>{source.file.name}</h3>
        <div className={`${styles.controls} ${styles.compareControls}`}>
          <button
            aria-pressed={actualSize}
            onClick={() => setActualSize(!actualSize)}
          >
            {actualSize ? "Fit previews" : "Actual output size"}
          </button>
        </div>
      </div>
      <div className={styles.controls}>
        <button
          disabled={!currentResult || preview.busy || Boolean(preview.error)}
          onClick={() => {
            setCandidateA({ result, settings: draft });
            setCompareOutputs(true);
          }}
        >
          {savedA ? "Replace A with current output" : "Save output as A"}
        </button>
        {savedA && (
          <>
            <button
              aria-pressed={compareOutputs}
              onClick={() => setCompareOutputs(!compareOutputs)}
            >
              {compareOutputs ? "Compare original" : "Compare A/B"}
            </button>
            <button onClick={() => onApply(savedA.settings)}>
              Apply A to batch
            </button>
            <button
              onClick={() => {
                setCandidateA(null);
                setCompareOutputs(false);
              }}
            >
              Discard A
            </button>
          </>
        )}
      </div>
      <p className={styles.hint}>
        {savedA
          ? "A is saved independently. Adjust the controls below to create B, then apply your preferred output to the batch."
          : "Save an output as A to compare two formats or quality settings."}{" "}
        Recent comparisons stay in this tab; older or large previews may be
        released to limit memory.
      </p>
      <div className={styles.controls}>
        <label htmlFor="preview-background">Preview background</label>
        <select
          id="preview-background"
          value={background}
          disabled={alphaOnly}
          onChange={(event) => setBackground(event.target.value)}
        >
          <option value="checkerboard">Checkerboard</option>
          <option value="#ffffff">White</option>
          <option value="#000000">Black</option>
          <option value="custom">Custom</option>
        </select>
        {background === "custom" && (
          <label>
            Custom preview colour{" "}
            <input
              type="color"
              value={customBackground}
              disabled={alphaOnly}
              onChange={(event) => setCustomBackground(event.target.value)}
            />
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={alphaOnly}
            onChange={(event) => setAlphaOnly(event.target.checked)}
          />
          Alpha-only view
        </label>
      </div>
      <p className={styles.hint}>
        {alphaOnly
          ? "Alpha channel: white is opaque, black is transparent and grey is partially transparent."
          : "Preview backgrounds help reveal transparent edges."}{" "}
        These controls affect only the preview; exported images are unchanged.
      </p>
      <div>
        <div className={styles.captions}>
          <span>
            {leftOutput
              ? `A · ${details(leftOutput)}`
              : `Original · ${formatKb(source.file.size)}`}
          </span>
          <span>
            {leftOutput ? "B" : changed ? "Trial output" : "Output"}
            {result ? ` · ${details(result)}` : ""}
          </span>
        </div>
        <div
          ref={comparison}
          className={`${styles.comparison} ${actualSize ? styles.actualSize : ""}`}
          style={{
            "--split": `${result ? split : 100}%`,
            "--preview-background":
              background === "checkerboard"
                ? undefined
                : background === "custom"
                  ? customBackground
                  : background,
          }}
          onPointerDown={(event) => {
            if (!result || event.button !== 0 || drag.current !== null) return;
            if (actualSize && !event.target.closest?.('[role="slider"]'))
              return;
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
                  <InspectorImage
                    alphaOnly={alphaOnly}
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
                <InspectorImage
                  alphaOnly={alphaOnly}
                  blob={leftOutput?.blob || source.file}
                  filename={`${leftOutput ? "Output A" : "Original"} ${source.file.name}`}
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
              aria-valuetext={`${Math.round(split)}% ${leftOutput ? "output A" : "original"} visible`}
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
            ? "Output pixels are shown at actual size. The original is scaled to align with the output. Drag an image to pan, or scroll."
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
          advanced={draft.advanced}
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
        <button onClick={() => setAdvancedOpen(true)} aria-haspopup="dialog">
          Advanced
        </button>
        <button
          disabled={!changed || preview.busy || Boolean(preview.error)}
          onClick={() => onApply(draft)}
        >
          {leftOutput ? "Apply B to batch" : "Apply to batch"}
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
      {(draft.format === "jpeg" ||
        (draft.format === "source" && source.sourceFormat === "jpeg")) && (
        <p>
          JPEG flattens transparency onto{" "}
          {draft.advanced?.jpeg?.background || "#ffffff"}.
        </p>
      )}
      {advancedOpen && (
        <AdvancedSettings
          settings={draft}
          initialFormat={resolveSettings(source, draft).format}
          trial
          onClose={() => setAdvancedOpen(false)}
          onApply={setDraft}
        />
      )}
    </>
  );
}

export default function ImageInspector(props) {
  const { source, sessions, index, total, onNavigate, onClose } = props;
  const saved = useRef(sessions.get(source.id));
  const previousId = useRef(source.id);
  const navigationFocus = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = (direction) => {
    navigationFocus.current =
      document.activeElement?.getAttribute("aria-label") ||
      (direction > 0 ? "Next image" : "Previous image");
    onNavigate(direction);
  };
  useLayoutEffect(() => {
    if (!navigationFocus.current) return;
    const label = ["Next image", "Previous image"].includes(
      navigationFocus.current,
    )
      ? navigationFocus.current
      : "Close image comparison";
    const target =
      document.querySelector(
        `dialog button[aria-label="${label}"]:not(:disabled)`,
      ) ??
      document.querySelector(
        'dialog button[aria-label="Close image comparison"]',
      );
    target?.focus({ preventScroll: true });
    navigationFocus.current = null;
  }, [source.id]);
  if (previousId.current !== source.id) {
    saved.current = sessions.get(source.id);
    previousId.current = source.id;
  }
  return (
    <Modal
      title="Image comparison"
      onClose={onClose}
      className={styles.inspector}
      onOpen={() => setIsOpen(true)}
      onKeyDown={(event) => {
        if (event.target.closest?.('input, select, textarea, [role="slider"]'))
          return;
        if (event.key === "ArrowLeft" && index > 0) {
          event.preventDefault();
          navigate(-1);
        }
        if (event.key === "ArrowRight" && index < total - 1) {
          event.preventDefault();
          navigate(1);
        }
      }}
    >
      <ComparisonContent
        key={source.id}
        {...props}
        onNavigate={navigate}
        saved={saved.current}
        isOpen={isOpen}
      />
    </Modal>
  );
}
