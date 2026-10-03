import { saveAs } from "file-saver";
import JSZip from "jszip";
import { Download, Play, RotateCcw, Upload, X } from "lucide-preact";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import styles from "./App.module.css";
import CompressionSelect from "./CompressionSelect";
import OutputImages from "./OutputImages";
import OutputFormatSelect from "./OutputFormatSelect";
import SizeSelect from "./SizeSelect";
import { useDragAndDrop } from "./useDragAndDrop";
import Errors from "./Errors";
import { nameOutputs } from "./imageUtils.js";
import { createJobOwner } from "./jobs.js";
import useBatchProcessor from "./useBatchProcessor.js";
import useImageImports from "./useImageImports.js";
import usePreferences from "./usePreferences.js";

function App() {
  const [images, setImages] = useState([]);
  const [zipError, setZipError] = useState("");
  const { preferences, setPreference, forgetPreferences, storageError } = usePreferences();
  const { boundingBox, outputFormat, qualityByFormat, pngColors, enableSuffix, suffix, disableUpscale, recentSizes } = preferences;
  const [isZipping, setIsZipping] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [retry, setRetry] = useState({ ids: [] });
  const dropRef = useRef(null);
  const imageIdRef = useRef(0);
  const zipOwner = useRef(createJobOwner());
  const settings = useMemo(() => ({
    bounds: boundingBox, format: outputFormat, qualityByFormat,
    colours: pngColors, disableUpscale,
  }), [boundingBox, outputFormat, qualityByFormat, pngColors, disableUpscale]);
  const { records, isProcessing, progress, processingTime, processor } =
    useBatchProcessor(images, settings, cancelled, retry);
  const resizedImages = useMemo(() => images.flatMap(({ id }) =>
    records[id]?.status === "ready" ? [records[id].result] : []
  ), [images, records]);
  const failedIds = images.filter(({ id }) => records[id]?.status === "error").map(({ id }) => id);
  const retryImages = (ids) => {
    processor.cancel();
    setCancelled(false);
    setRetry({ ids });
  };

  const invalidate = useCallback(() => {
    processor.cancel();
    zipOwner.current.cancel();
    setIsZipping(false);
    setCancelled(false);
    setZipError("");
  }, [processor]);

  const { addFiles: handleImageUpload, cancelImports, isImporting, errors: uploadErrors, clearErrors } = useImageImports((accepted) => {
    invalidate();
    setImages((current) => [...current, ...accepted.map((source) => ({ ...source, id: String(imageIdRef.current++) }))]);
  }, images);

  const handleFileInputChange = (event) => {
    if (event.target.files) {
      handleImageUpload(event.target.files);
      event.target.value = "";
    }
  };

  // Drag and drop uses the same invalidation path as the file picker.
  useDragAndDrop(dropRef, handleImageUpload);

  useEffect(() => {
    const owner = zipOwner.current;
    return () => owner.cancel();
  }, []);

  const changeSetting = (key) => (value) => {
    if (JSON.stringify(preferences[key]) === JSON.stringify(value)) return;
    invalidate();
    setPreference(key, value);
  };

  const handleReset = () => {
    cancelImports();
    invalidate();
    processor.clear();
    setImages([]);
  };

  const handleRemoveImage = (id) => {
    invalidate();
    setImages((current) => current.filter((image) => image.id !== id));
  };

  const outputs = useMemo(
    () => nameOutputs(resizedImages, enableSuffix, suffix),
    [resizedImages, enableSuffix, suffix]
  );

  // ZIP work has independent ownership so reset cannot trigger a late download.
  const downloadZip = async () => {
    if (isZipping || !outputs.length) return;
    const job = zipOwner.current.start();
    setIsZipping(true);
    setZipError("");
    try {
      const zip = new JSZip();
      for (const { downloadFilename, blob } of outputs)
        zip.file(downloadFilename, blob);
      const blob = await zip.generateAsync({ type: "blob" }, () =>
        job.signal.throwIfAborted()
      );
      if (job.isCurrent()) saveAs(blob, "resized_images.zip");
    } catch (error) {
      if (job.isCurrent())
        setZipError(`Error creating ZIP file: ${error.message}`);
    } finally {
      if (job.isCurrent()) setIsZipping(false);
    }
  };

  const cancelResize = () => {
    processor.cancel();
    setCancelled(true);
  };
  const isEmpty = images.length === 0;

  return (
    <div ref={dropRef} className={styles.app}>
      <div className={styles.header}>
        <h1 className={styles.title}>Batch Image Resizer</h1>
        <div className={styles.config}>
          <div className={styles.controlGroup}>
            <SizeSelect
              onChange={changeSetting("boundingBox")}
              recentSizes={recentSizes}
              width={boundingBox.width}
              height={boundingBox.height}
            />
            <label>
              <input
                type="checkbox"
                checked={disableUpscale}
                onChange={() =>
                  changeSetting("disableUpscale")(!disableUpscale)
                }
              />
              Do not enlarge
            </label>
          </div>
          <div className={styles.controlGroup}>
            <OutputFormatSelect
              onChange={changeSetting("outputFormat")}
              value={outputFormat}
            />
            <CompressionSelect
              format={outputFormat}
              onQualityChange={(format, quality) => changeSetting("qualityByFormat")({ ...qualityByFormat, [format]: quality })}
              qualityByFormat={qualityByFormat}
              sourceFormats={images.map(({ sourceFormat }) => sourceFormat)}
              pngColors={pngColors}
              onPngColorsChange={changeSetting("pngColors")}
            />
            {outputFormat === "jpeg" && <span className={styles.hint}>Transparent areas become white in JPEG.</span>}
          </div>
          <div className={styles.controlGroup}>
            <label>
              <input
                type="checkbox"
                checked={enableSuffix}
                disabled={isZipping}
                onChange={() => setPreference("enableSuffix", !enableSuffix)}
              />
              Add suffix
            </label>
            <input
              type="text"
              value={suffix}
              onChange={(e) => setPreference("suffix", e.target.value)}
              aria-label="Filename suffix"
              placeholder="Suffix"
              maxLength={100}
              disabled={!enableSuffix || isZipping}
              className={styles.suffix}
            />
          </div>
          <div className={`${styles.controlGroup} ${styles.actions}`}>
            <button
              onClick={downloadZip}
              disabled={!outputs.length || isZipping || isEmpty}
              className={outputs.length ? "buttonPrimary" : undefined}
            >
              <Download size={15} aria-hidden="true" />
              {isZipping ? "Creating ZIP..." : `Download ${outputs.length || ""} ready as ZIP`}
            </button>
            <button
              className="buttonIcon"
              onClick={handleReset}
              disabled={isEmpty}
              aria-label="Reset batch"
              title="Reset batch"
            >
              <RotateCcw size={15} aria-hidden="true" />
            </button>
            {isProcessing && (
              <button onClick={cancelResize}>
                <X size={15} aria-hidden="true" />
                Cancel
              </button>
            )}
            {cancelled && (
              <button
                onClick={() => {
                  invalidate();
                  setRetry({ ids: [] });
                }}
              >
                <Play size={15} aria-hidden="true" />
                Resume
              </button>
            )}
            <label className="button">
              <input
                type="file"
                accept="image/jpeg, image/png, image/webp"
                multiple
                onChange={handleFileInputChange}
              />
              <Upload size={15} aria-hidden="true" />
              {isEmpty ? "Load images" : "Add images"}
            </label>
          </div>
        </div>
      </div>
      <Errors
        onDismiss={() => { clearErrors(); setZipError(""); }}
        errors={[
          ...uploadErrors,
          ...(zipError ? [zipError] : []),
        ]}
      />
      {isImporting && <p role="status">Checking image files…</p>}
      {cancelled && (
        <div className={styles.status} role="status">
          Cancelled.{" "}
          <span className="numeric">
            {progress} of {images.length}
          </span>{" "}
          images processed.
        </div>
      )}
      <OutputImages
        images={images}
        records={records}
        resizedImages={outputs}
        loading={isProcessing}
        progress={progress}
        total={images.length}
        processingTime={processingTime}
        onFileInputChange={handleFileInputChange}
        inputDisabled={false}
        onRemoveImage={handleRemoveImage}
        onRetryImage={(id) => retryImages([id])}
        onRetryFailed={() => retryImages(failedIds)}
      />
      <div className={styles.footer}>
        <details className={styles.storage}>
          <summary>Saved data and preferences</summary>
          <label><input type="checkbox" checked={preferences.rememberPreferences} onChange={(event) => event.target.checked ? setPreference("rememberPreferences", true) : forgetPreferences()} />Remember preferences on this device</label>
          <button onClick={forgetPreferences}>Clear saved preferences (Local Storage)</button>
          <p>Clearing keeps your current settings in this tab and stops saving them until you enable remembering again.</p>
          {storageError && <p role="alert">{storageError}</p>}
        </details>
        <p>
          Your images are resized directly in your browser using the HTML5
          Canvas API and browser-side encoders, ensuring privacy and speed. No
          data is uploaded to any server. Source code on{" "}
          <a href="https://github.com/andygock/batch-image-resizer/">GitHub</a>.
        </p>
      </div>
    </div>
  );
}

export default App;
