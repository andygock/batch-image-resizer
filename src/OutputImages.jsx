import { useEffect, useState } from "react";
import { Download, ImagePlus, Trash2 } from "lucide-preact";
import styles from "./OutputImages.module.css";

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
    {url && <img src={url} alt={filename} width={width} height={height} loading="lazy" />}
    {children?.(url)}
  </>;
}

export default function OutputImages({
  images, records, resizedImages, loading, progress, total, processingTime,
  onFileInputChange, inputDisabled, onRemoveImage,
}) {
  if (!images.length) return <div className={styles.empty}>
    <ImagePlus className={styles.emptyIcon} size={24} strokeWidth={1.5} aria-hidden="true" />
    <p>Drop JPG, PNG or WebP files here.</p>
    <label className="button buttonPrimary">
      <input type="file" accept="image/jpeg, image/png, image/webp" multiple onChange={onFileInputChange} disabled={inputDisabled} />
      <ImagePlus size={15} aria-hidden="true" /> Choose images
    </label>
  </div>;

  const outputs = new Map(resizedImages.map((image) => [image.id, image]));
  const totalBefore = resizedImages.reduce((sum, image) => sum + image.filesizeBefore, 0);
  const totalAfter = resizedImages.reduce((sum, image) => sum + image.filesizeAfter, 0);
  const savedPercent = totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;

  return <>
    <div className={styles.summary}>
      <span className="numeric">{resizedImages.length} of {total} ready</span>
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
    </div>
    <div className={styles.grid}>
      {images.map(({ id, file }) => {
        const record = records[id];
        const result = record?.result;
        const output = outputs.get(id);
        const status = record?.status ?? "pending";
        const maxWidth = `calc(${Math.max(result?.widthAfter ?? 220, 220)}px + 2 * var(--image-card-padding) + 2px)`;
        return <div key={id} className={styles.imageCard} style={{ maxWidth }}>
          <OutputImage blob={result?.blob ?? file} filename={file.name} width={result?.widthAfter} height={result?.heightAfter}>
            {(url) => <div className={styles.imageInfo}>
              <div className={styles.filename} title={file.name}>{file.name}</div>
              <div className={`${styles.fileInfo} numeric`}>
                {result && <>
                  <span>{result.widthBefore}×{result.heightBefore} → {result.widthAfter}×{result.heightAfter}</span>
                  <span>{formatKb(result.filesizeBefore)} → <strong>{formatKb(result.filesizeAfter)}</strong></span>
                </>}
                {status !== "ready" && <span>{status === "processing" ? "Processing…" : status === "error" ? "Could not process" : "Waiting"}{result ? " · showing previous output" : ""}</span>}
              </div>
              <div className={styles.imageActions}>
                {output && <a href={url || undefined} download={output.downloadFilename} title={`Download "${output.downloadFilename}"`} className="button buttonIcon" aria-label={`Download ${output.downloadFilename}`}>
                  <Download size={14} aria-hidden="true" />
                </a>}
                <button type="button" className="buttonIcon buttonDanger" onClick={() => onRemoveImage(id)} title={`Remove "${file.name}"`} aria-label={`Remove ${file.name}`}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>}
          </OutputImage>
        </div>;
      })}
    </div>
  </>;
}
