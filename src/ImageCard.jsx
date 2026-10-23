import { Download, Trash2 } from "lucide-preact";
import { memo } from "react";
import { formatKb } from "./formatBytes.js";
import OutputImage from "./OutputImage.jsx";
import styles from "./OutputImages.module.css";

export default memo(function ImageCard({
  source,
  record,
  output,
  downloadFilename,
  selected,
  downloadsBlocked,
  actions,
}) {
  const { id, file } = source;
  const result = record?.result;
  const status = record?.status ?? "pending";
  return (
    <div id={`image-${id}`} className={styles.imageCard}>
      <label className={styles.selectImage}>
        <input
          type="checkbox"
          checked={selected}
          onClick={(event) => actions.onSelectImage(id, event.shiftKey)}
          onChange={() => {}}
        />
        <span className="visuallyHidden">Select {file.name}</span>
      </label>
      <OutputImage
        blob={result?.blob ?? file}
        filename={file.name}
        width={result?.widthAfter}
        height={result?.heightAfter}
        onInspect={() => actions.onInspect(id)}
      >
        {(url) => (
          <div className={styles.imageInfo}>
            <div className={styles.filename} title={downloadFilename}>
              {downloadFilename}
            </div>
            {file.name !== downloadFilename && (
              <div className={styles.sourceName}>Source: {file.name}</div>
            )}
            <div className={`${styles.fileInfo} numeric`}>
              {result && (
                <>
                  <span>
                    {result.widthBefore}×{result.heightBefore} →{" "}
                    {result.widthAfter}×{result.heightAfter}
                  </span>
                  <span>
                    {formatKb(result.filesizeBefore)} →{" "}
                    <strong>{formatKb(result.filesizeAfter)}</strong>
                  </span>
                </>
              )}
              {status !== "ready" && (
                <span>
                  {status === "processing"
                    ? "Processing…"
                    : status === "error"
                      ? "Could not process"
                      : "Waiting"}
                  {result ? " · showing previous output" : ""}
                </span>
              )}
            </div>
            <div className={styles.imageActions}>
              {status === "error" && (
                <button onClick={() => actions.onRetryImage(id)}>Retry</button>
              )}
              {output && (
                <a
                  href={!downloadsBlocked && url ? url : undefined}
                  download={downloadFilename}
                  aria-disabled={downloadsBlocked || !url}
                  title={
                    downloadsBlocked
                      ? "Fix the custom dimensions before downloading"
                      : `Download "${downloadFilename}"`
                  }
                  className="button buttonIcon"
                  aria-label={`Download ${downloadFilename}`}
                >
                  <Download size={14} aria-hidden="true" />
                </a>
              )}
              <button
                type="button"
                className="buttonIcon buttonDanger"
                onClick={() => actions.onRemoveImage(id)}
                title={`Remove "${file.name}"`}
                aria-label={`Remove ${file.name}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
            {status === "error" && (
              <div className={styles.error}>
                <p>{record.error}</p>
                <p>
                  {record.error.includes("decode")
                    ? "Automatic recovery could not read this image. Retry, or add the original file again."
                    : "Try a smaller size or another output format, then retry."}
                </p>
              </div>
            )}
            {result?.encodingWarning && (
              <p className={styles.encodingNotice}>{result.encodingWarning}</p>
            )}
          </div>
        )}
      </OutputImage>
    </div>
  );
});
