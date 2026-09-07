import { useEffect, useState } from "react";
import { Download, ImagePlus, Trash2 } from "lucide-preact";
import styles from "./OutputImages.module.css";

const formatKb = (bytes) => `${Math.ceil(bytes / 1024)} kB`;

function OutputImage({ blob, filename, width, height, children }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);
  return (
    <>
      {url && (
        <img
          src={url}
          alt={filename}
          width={width}
          height={height}
          loading="lazy"
        />
      )}
      {children(url)}
    </>
  );
}

export default function OutputImages({
  resizedImages,
  loading,
  progress,
  total,
  processingTime,
  onFileInputChange,
  inputDisabled,
  onRemoveImage,
}) {
  if (loading) {
    return (
      <div className={styles.status} role="status">
        Processing images:{" "}
        <span className="numeric">
          {progress} of {total}
        </span>
        <progress
          value={progress}
          max={Math.max(1, total)}
          aria-label="Images processed"
        />
      </div>
    );
  }

  if (!resizedImages.length) {
    return (
      <div className={styles.empty}>
        <ImagePlus
          className={styles.emptyIcon}
          size={24}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p>Drop JPG, PNG or WebP files here.</p>
        <label className="button buttonPrimary">
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            multiple
            onChange={onFileInputChange}
            disabled={inputDisabled}
          />
          <ImagePlus size={15} aria-hidden="true" />
          Choose images
        </label>
      </div>
    );
  }

  const totalBefore = resizedImages.reduce(
    (total, image) => total + image.filesizeBefore,
    0
  );
  const totalAfter = resizedImages.reduce(
    (total, image) => total + image.filesizeAfter,
    0
  );
  const savedPercent =
    totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;

  return (
    <>
      <div className={styles.summary}>
        <span className="numeric">
          {resizedImages.length}{" "}
          {resizedImages.length === 1 ? "image" : "images"} resized
        </span>
        <span className="numeric">
          {formatKb(totalBefore)} -&gt; {formatKb(totalAfter)}
        </span>
        <span
          className={`numeric ${savedPercent >= 0 ? "positive" : "negative"}`}
        >
          {savedPercent >= 0 ? "Saved" : "Increased"} {Math.abs(savedPercent)}%
        </span>
        {processingTime >= 0.01 && (
          <span className="numeric">{processingTime}s</span>
        )}
      </div>

      <div className={styles.grid}>
        {resizedImages.map(
          ({
            filename,
            id,
            filesizeBefore,
            filesizeAfter,
            widthBefore,
            heightBefore,
            widthAfter,
            heightAfter,
            blob,
            downloadFilename,
          }) => {
            const fileSizeDelta = Math.round(
              (filesizeAfter / filesizeBefore - 1) * 100
            );
            const maxWidth = `calc(${Math.max(
              widthAfter,
              220
            )}px + 2 * var(--image-card-padding) + 2px)`;

            return (
              <div key={id} className={styles.imageCard} style={{ maxWidth }}>
                <OutputImage
                  blob={blob}
                  filename={filename}
                  width={widthAfter}
                  height={heightAfter}
                >
                  {(url) => (
                    <div className={styles.imageInfo}>
                      <div className={styles.filename} title={filename}>
                        {filename}
                      </div>
                      <div className={`${styles.fileInfo} numeric`}>
                        <span>
                          {widthBefore}x{heightBefore} -&gt; {widthAfter}x
                          {heightAfter}
                        </span>
                        <span>
                          {formatKb(filesizeBefore)} -&gt;{" "}
                          <strong>{formatKb(filesizeAfter)}</strong>
                        </span>
                        <span
                          className={
                            fileSizeDelta <= 0 ? "positive" : "negative"
                          }
                        >
                          {fileSizeDelta > 0 ? "+" : ""}
                          {fileSizeDelta}%
                        </span>
                      </div>
                      <div className={styles.imageActions}>
                        <a
                          href={url || undefined}
                          download={downloadFilename}
                          title={`Download "${downloadFilename}"`}
                          className="button buttonIcon"
                          aria-label={`Download ${downloadFilename}`}
                        >
                          <Download size={14} aria-hidden="true" />
                        </a>
                        <button
                          type="button"
                          className="buttonIcon buttonDanger"
                          onClick={() => onRemoveImage(id)}
                          title={`Remove "${filename}"`}
                          aria-label={`Remove ${filename}`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </OutputImage>
              </div>
            );
          }
        )}
      </div>
    </>
  );
}
