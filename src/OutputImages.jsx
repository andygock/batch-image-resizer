import { useEffect, useMemo } from "react";

const formatKb = (bytes) => `${Math.ceil(bytes / 1024)} kB`;

const getDownloadFilename = (filename, extension, enableSuffix, suffix) => {
  const lastDotIndex = filename.lastIndexOf(".");
  const name =
    lastDotIndex === -1 ? filename : filename.substring(0, lastDotIndex);

  return `${enableSuffix ? `${name}${suffix}` : name}.${extension}`;
};

export default function OutputImages({
  resizedImages,
  suffix,
  enableSuffix,
  loading,
  processingTime,
  onFileInputChange,
  inputDisabled,
}) {
  const imageUrls = useMemo(
    () =>
      resizedImages.map(({ blob }) => ({
        blob,
        url: URL.createObjectURL(blob),
      })),
    [resizedImages],
  );

  useEffect(
    () => () => {
      imageUrls.forEach(({ url }) => URL.revokeObjectURL(url));
    },
    [imageUrls],
  );

  if (loading) {
    return (
      <div className="status-panel" role="status">
        Processing images...
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
    0,
  );
  const totalAfter = resizedImages.reduce(
    (total, image) => total + image.filesizeAfter,
    0,
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
          {savedPercent >= 0 ? "Saved" : "Increased"}{" "}
          {Math.abs(savedPercent)}%
        </span>
        {processingTime >= 0.01 && <span>{processingTime}s</span>}
      </div>

      <div className="output-grid">
        {resizedImages.map(
          (
            {
              filename,
              filesizeBefore,
              filesizeAfter,
              widthBefore,
              heightBefore,
              widthAfter,
              heightAfter,
              outputExtension,
            },
            index,
          ) => {
            const url = imageUrls[index].url;
            const fileSizeDelta = Math.round(
              (filesizeAfter / filesizeBefore - 1) * 100,
            );
            const downloadFilename = getDownloadFilename(
              filename,
              outputExtension,
              enableSuffix,
              suffix,
            );

            const rootStyle = getComputedStyle(document.documentElement);
            const pad = parseFloat(rootStyle.getPropertyValue("--pad"));
            const border = 1;
            const extraWidth = 2 * (pad + border);
            const maxWidth = Math.max(widthAfter, 220) + extraWidth;

            return (
              <div key={filename + index} className="output-images" style={{ maxWidth }}>
                <img
                  src={url}
                  alt={filename}
                  width={widthAfter}
                  height={heightAfter}
                />
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
                      className={fileSizeDelta <= 0 ? "positive" : "negative"}
                    >
                      {fileSizeDelta > 0 ? "+" : ""}
                      {fileSizeDelta}%
                    </span>
                  </div>
                  <a
                    href={url}
                    download={downloadFilename}
                    title={`Download "${downloadFilename}"`}
                    className="download"
                  >
                    Download
                  </a>
                </div>
              </div>
            );
          },
        )}
      </div>
    </>
  );
}
