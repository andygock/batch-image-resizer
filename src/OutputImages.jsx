import { ImagePlus } from "lucide-preact";
import { useMemo, useRef } from "react";
import { formatKb } from "./formatBytes.js";
import ImageCard from "./ImageCard.jsx";
import styles from "./OutputImages.module.css";

export default function OutputImages({
  images,
  records,
  resizedImages,
  loading,
  progress,
  total,
  processingTime,
  onFileInputChange,
  inputDisabled,
  onRemoveImage,
  onRetryImage,
  onRetryFailed,
  downloadsBlocked,
  outputNames,
  selected,
  onSelectImage,
  onSelectAll,
  onClearSelection,
  onRemoveSelected,
  onDownloadSelected,
  isZipping,
  viewMode,
  onViewModeChange,
  onInspect,
}) {
  const callbacks = useRef(null);
  callbacks.current = { onInspect, onSelectImage, onRetryImage, onRemoveImage };
  // Stable delegates let unchanged cards skip renders while using current handlers.
  const actions = useMemo(
    () =>
      Object.fromEntries(
        ["onInspect", "onSelectImage", "onRetryImage", "onRemoveImage"].map(
          (name) => [name, (...args) => callbacks.current[name](...args)],
        ),
      ),
    [],
  );
  if (!images.length)
    return (
      <div className={styles.empty}>
        <ImagePlus
          className={styles.emptyIcon}
          size={24}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p>Drop JPG, PNG, WebP or AVIF files here, or paste an image.</p>
        <label className="button buttonPrimary">
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp, image/avif"
            multiple
            onChange={onFileInputChange}
            disabled={inputDisabled}
          />
          <ImagePlus size={15} aria-hidden="true" /> Choose images
        </label>
      </div>
    );

  const outputs = new Map(resizedImages.map((image) => [image.id, image]));
  const totalBefore = resizedImages.reduce(
    (sum, image) => sum + image.filesizeBefore,
    0,
  );
  const totalAfter = resizedImages.reduce(
    (sum, image) => sum + image.filesizeAfter,
    0,
  );
  const savedPercent =
    totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;
  const failed = images.filter(
    ({ id }) => records[id]?.status === "error",
  ).length;
  const pending = total - resizedImages.length - failed;
  const selectedReady = resizedImages.filter(({ id }) =>
    selected.has(id),
  ).length;

  return (
    <>
      <div className={styles.summary}>
        <span className="numeric">
          {resizedImages.length} of {total} ready
        </span>
        {failed > 0 && (
          <>
            <span>{failed} failed</span>
            <button onClick={onRetryFailed}>Retry failed</button>
          </>
        )}
        {pending > 0 && (
          <span>
            {pending} {loading ? "remaining" : "waiting"}
          </span>
        )}
        {resizedImages.length > 0 && (
          <>
            <span className="numeric">
              {formatKb(totalBefore)} → {formatKb(totalAfter)}
            </span>
            <span
              className={`numeric ${savedPercent >= 0 ? "positive" : "negative"}`}
            >
              {savedPercent >= 0 ? "Saved" : "Increased"}{" "}
              {Math.abs(savedPercent)}%
            </span>
          </>
        )}
        {loading && (
          <span role="status">
            Processing {progress} of {total}
            <progress
              value={progress}
              max={Math.max(1, total)}
              aria-label="Images processed"
            />
          </span>
        )}
        {!loading && processingTime >= 0.01 && (
          <span className="numeric">{processingTime}s</span>
        )}
        <label>
          View{" "}
          <select
            value={viewMode}
            onChange={(event) => onViewModeChange(event.target.value)}
          >
            <option value="grid">Grid</option>
            <option value="list">List</option>
          </select>
        </label>
        <button onClick={onSelectAll} disabled={selected.size === total}>
          Select all
        </button>
        {selected.size > 0 && (
          <>
            <span>
              {selected.size} selected · {selectedReady} ready
            </span>
            <button
              onClick={onDownloadSelected}
              disabled={!selectedReady || downloadsBlocked || isZipping}
            >
              Download {selectedReady} selected as ZIP
            </button>
            <button onClick={onRemoveSelected}>Remove selected</button>
            <button onClick={onClearSelection}>Clear selection</button>
          </>
        )}
        <span>Shift-click to select a range.</span>
      </div>
      <div
        className={`${styles.grid} ${viewMode === "list" ? styles.list : ""}`}
        role="group"
        aria-label="Image batch"
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            event.target.closest?.(
              "input:not([type='checkbox']), textarea, [contenteditable='true']",
            )
          )
            return;
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "a"
          ) {
            event.preventDefault();
            onSelectAll();
          }
          if (event.key === "Delete" && selected.size) {
            event.preventDefault();
            onRemoveSelected();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onClearSelection();
          }
        }}
      >
        {images.map((source) => (
          <ImageCard
            key={source.id}
            source={source}
            record={records[source.id]}
            output={outputs.has(source.id)}
            downloadFilename={outputNames.get(source.id)}
            selected={selected.has(source.id)}
            downloadsBlocked={downloadsBlocked}
            actions={actions}
          />
        ))}
      </div>
    </>
  );
}
