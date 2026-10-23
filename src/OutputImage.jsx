import styles from "./OutputImages.module.css";
import useImageUrl from "./useImageUrl.js";

export default function OutputImage({
  blob,
  filename,
  width,
  height,
  children,
  onInspect,
}) {
  const { url, previewUrl, onError, onLoad, error } = useImageUrl(blob);
  const img = url && !error && (
    <img
      src={previewUrl}
      onError={onError}
      onLoad={onLoad}
      alt={filename}
      width={width}
      height={height}
      loading="lazy"
      draggable={false}
    />
  );
  return (
    <>
      {onInspect ? (
        <button
          className={styles.previewButton}
          onClick={onInspect}
          title="Compare original and output"
          aria-label={`Compare ${filename}`}
        >
          {img}
        </button>
      ) : (
        img
      )}
      {children?.(url)}
      {error && <small role="status">{error}</small>}
    </>
  );
}
