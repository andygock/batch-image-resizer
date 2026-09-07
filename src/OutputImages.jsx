import { useEffect, useState } from "react";

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
      <div className="status-panel" role="status">
        Processing images: {progress} of {total}
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
      <div className="empty-state">
        <p>Drop JPG, PNG or WebP files here.</p>
        <label className="file-upload-label primary-action">
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            multiple
            onChange={onFileInputChange}
            disabled={inputDisabled}
          />
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
      <div className="batch-summary">
        <span>
          {resizedImages.length}{" "}
          {resizedImages.length === 1 ? "image" : "images"} resized
        </span>
        <span>
          {formatKb(totalBefore)} -&gt; {formatKb(totalAfter)}
        </span>
        <span className={savedPercent >= 0 ? "positive" : "negative"}>
          {savedPercent >= 0 ? "Saved" : "Increased"} {Math.abs(savedPercent)}%
        </span>
        {processingTime >= 0.01 && <span>{processingTime}s</span>}
      </div>

      <div className="output-grid">
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
            )}px + 2 * var(--pad) + 2px)`;

            return (
              <div key={id} className="output-images" style={{ maxWidth }}>
                <OutputImage
                  blob={blob}
                  filename={filename}
                  width={widthAfter}
                  height={heightAfter}
                >
                  {(url) => (
                    <div className="image-info">
                      <div className="filename" title={filename}>
                        {filename}
                      </div>
                      <div className="file-info">
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
                      <div className="image-actions">
                        <a
                          href={url || undefined}
                          download={downloadFilename}
                          title={`Download "${downloadFilename}"`}
                          className="download"
                        >
                          Download
                        </a>
                        <button
                          type="button"
                          className="remove-image"
                          onClick={() => onRemoveImage(id)}
                          title={`Remove "${filename}"`}
                        >
                          Remove
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
