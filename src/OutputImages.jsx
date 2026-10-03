import { useEffect, useState } from "react";
import { Download, ImagePlus, Trash2 } from "lucide-preact";
import styles from "./OutputImages.module.css";
import { downloadRequestKey } from "./downloads.js";

export const formatKb = (bytes) => `${Math.ceil(bytes / 1024)} kB`;

export function OutputImage({ blob, filename, width, height, children }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob);
    setPreview({ blob, url: nextUrl });
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);
  const url = preview?.blob === blob ? preview.url : "";
  return <>
    {url && <img src={url} alt={filename} width={width} height={height} loading="lazy" draggable={false} />}
    {children?.(url)}
  </>;
}

export default function OutputImages({
  images, records, resizedImages, loading, progress, total, processingTime,
  onFileInputChange, inputDisabled, onRemoveImage, onRetryImage, onRetryFailed,
  downloadsBlocked,
  outputNames,
  selected, onSelectImage, onSelectAll, onClearSelection, onRemoveSelected, onDownloadSelected, isZipping,
  viewMode, onViewModeChange,
  downloadRequests, onDownloadRequested,
}) {
  if (!images.length) return <div className={styles.empty}>
    <ImagePlus className={styles.emptyIcon} size={24} strokeWidth={1.5} aria-hidden="true" />
    <p>Drop JPG, PNG or WebP files here, or paste an image.</p>
    <label className="button buttonPrimary">
      <input type="file" accept="image/jpeg, image/png, image/webp" multiple onChange={onFileInputChange} disabled={inputDisabled} />
      <ImagePlus size={15} aria-hidden="true" /> Choose images
    </label>
  </div>;

  const outputs = new Map(resizedImages.map((image) => [image.id, image]));
  const totalBefore = resizedImages.reduce((sum, image) => sum + image.filesizeBefore, 0);
  const totalAfter = resizedImages.reduce((sum, image) => sum + image.filesizeAfter, 0);
  const savedPercent = totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;
  const failed = images.filter(({ id }) => records[id]?.status === "error").length;
  const pending = total - resizedImages.length - failed;
  const selectedReady = resizedImages.filter(({ id }) => selected.has(id)).length;

  return <>
    <div className={styles.summary}>
      <span className="numeric">{resizedImages.length} of {total} ready</span>
      {failed > 0 && <><span>{failed} failed</span><button onClick={onRetryFailed}>Retry failed</button></>}
      {pending > 0 && <span>{pending} {loading ? "remaining" : "waiting"}</span>}
      {resizedImages.length > 0 && <>
        <span className="numeric">{formatKb(totalBefore)} → {formatKb(totalAfter)}</span>
        <span className={`numeric ${savedPercent >= 0 ? "positive" : "negative"}`}>
          {savedPercent >= 0 ? "Saved" : "Increased"} {Math.abs(savedPercent)}%
        </span>
      </>}
      {loading && <span role="status">Processing {progress} of {total}
        <progress value={progress} max={Math.max(1, total)} aria-label="Images processed" />
      </span>}
      {!loading && processingTime >= 0.01 && <span className="numeric">{processingTime}s</span>}
      <label>View <select value={viewMode} onChange={(event) => onViewModeChange(event.target.value)}><option value="grid">Grid</option><option value="list">List</option></select></label>
      <button onClick={onSelectAll} disabled={selected.size === total}>Select all</button>
      {selected.size > 0 && <>
        <span>{selected.size} selected · {selectedReady} ready</span>
        <button onClick={onDownloadSelected} disabled={!selectedReady || downloadsBlocked || isZipping}>Download {selectedReady} selected as ZIP</button>
        <button onClick={onRemoveSelected}>Remove selected</button>
        <button onClick={onClearSelection}>Clear selection</button>
      </>}
      <span>Shift-click to select a range.</span>
    </div>
    <div className={`${styles.grid} ${viewMode === "list" ? styles.list : ""}`} role="group" aria-label="Image batch" tabIndex={0} onKeyDown={(event) => {
      if (event.target.closest?.("input:not([type='checkbox']), textarea, [contenteditable='true']")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); onSelectAll(); }
      if (event.key === "Delete" && selected.size) { event.preventDefault(); onRemoveSelected(); }
      if (event.key === "Escape") { event.preventDefault(); onClearSelection(); }
    }}>
      {images.map(({ id, file }) => {
        const record = records[id];
        const result = record?.result;
        const output = outputs.get(id);
        const status = record?.status ?? "pending";
        return <div key={id} id={`image-${id}`} className={styles.imageCard}>
          <label className={styles.selectImage}><input type="checkbox" checked={selected.has(id)} onClick={(event) => onSelectImage(id, event.shiftKey)} onChange={() => {}} /><span className="visuallyHidden">Select {file.name}</span></label>
          <OutputImage blob={result?.blob ?? file} filename={file.name} width={result?.widthAfter} height={result?.heightAfter}>
            {(url) => <div className={styles.imageInfo}>
              <div className={styles.filename} title={outputNames.get(id)}>{outputNames.get(id)}</div>
              {file.name !== outputNames.get(id) && <div className={styles.sourceName}>Source: {file.name}</div>}
              <div className={`${styles.fileInfo} numeric`}>
                {result && <>
                  <span>{result.widthBefore}×{result.heightBefore} → {result.widthAfter}×{result.heightAfter}</span>
                  <span>{formatKb(result.filesizeBefore)} → <strong>{formatKb(result.filesizeAfter)}</strong></span>
                </>}
                {status !== "ready" && <span>{status === "processing" ? "Processing…" : status === "error" ? "Could not process" : "Waiting"}{result ? " · showing previous output" : ""}</span>}
              </div>
              <div className={styles.imageActions}>
                {status === "error" && <button onClick={() => onRetryImage(id)}>Retry</button>}
                {output && <a href={!downloadsBlocked && url ? url : undefined} aria-disabled={downloadsBlocked || !url} onClick={(event) => { if (downloadsBlocked || !url) event.preventDefault(); else onDownloadRequested(output); }} download={output.downloadFilename} title={downloadsBlocked ? "Fix the custom dimensions before downloading" : `Download "${output.downloadFilename}"`} className="button buttonIcon" aria-label={`Download ${output.downloadFilename}`}>
                  <Download size={14} aria-hidden="true" />
                </a>}
                <button type="button" className="buttonIcon buttonDanger" onClick={() => onRemoveImage(id)} title={`Remove "${file.name}"`} aria-label={`Remove ${file.name}`}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              {output && downloadRequests.has(downloadRequestKey(output)) && <span className={styles.sourceName}>Download requested</span>}
              {status === "error" && <div className={styles.error}>
                <p>{record.error}</p>
                <p>{record.error.includes("decode") ? "Try exporting this file again as JPG, PNG or WebP, then add the replacement." : "Try a smaller size or another output format, then retry."}</p>
              </div>}
              {result?.encodingWarning && <p className={styles.encodingNotice}>{result.encodingWarning}</p>}
            </div>}
          </OutputImage>
        </div>;
      })}
    </div>
  </>;
}
