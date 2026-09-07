import { saveAs } from "file-saver";
import JSZip from "jszip";
import { Download, Play, RotateCcw, Upload, X } from "lucide-preact";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { resizeImage } from "./resizeImage.js";

function App() {
  const [images, setImages] = useState([]);
  const [resizedImages, setResizedImages] = useState([]);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [processingErrors, setProcessingErrors] = useState([]);
  const [zipError, setZipError] = useState("");
  const [boundingBox, setBoundingBox] = useState({ width: 512, height: 512 });
  const [outputFormat, setOutputFormat] = useState("jpeg");
  const [compressionLevel, setCompressionLevel] = useState(0.8); // Default compression level
  const [pngColors, setPngColors] = useState(0);
  const [enableSuffix, setEnableSuffix] = useState(true);
  const [suffix, setSuffix] = useState("_small");
  const [disableUpscale, setDisableUpscale] = useState(true);
  const [processingTime, setProcessingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [retry, setRetry] = useState(0);
  const dropRef = useRef(null);
  const imageIdRef = useRef(0);
  const resizeOwner = useRef(createJobOwner());
  const zipOwner = useRef(createJobOwner());
  // Retain one output per source; settings changes replace cached outputs.
  const cache = useRef(new Map());

  const invalidate = useCallback(() => {
    resizeOwner.current.cancel();
    zipOwner.current.cancel();
    setIsZipping(false);
    setIsProcessing(true);
    setCancelled(false);
    setZipError("");
  }, []);

  const handleImageUpload = useCallback(
    (files) => {
      const newErrors = [];
      const newImages = [];
      for (const file of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          newErrors.push(
            `File "${file.name}" is not a JPEG, PNG or WebP image.`
          );
          continue;
        }
        newImages.push({ id: String(imageIdRef.current++), file });
      }
      setUploadErrors(newErrors);
      if (newImages.length) {
        invalidate();
        setImages((current) => [...current, ...newImages]);
      }
    },
    [invalidate]
  );

  const handleFileInputChange = (event) => {
    if (event.target.files) {
      handleImageUpload(event.target.files);
      event.target.value = "";
    }
  };

  // Drag and drop uses the same invalidation path as the file picker.
  useDragAndDrop(dropRef, handleImageUpload);

  // Establish ownership at commit time, before a user can cancel the next run.
  useLayoutEffect(() => {
    const owner = resizeOwner.current;
    const job = owner.start();
    const settings = {
      bounds: boundingBox,
      format: outputFormat,
      quality: compressionLevel,
      colours: pngColors,
      disableUpscale,
    };
    const key = JSON.stringify({
      ...settings,
      quality: outputFormat === "png" ? null : compressionLevel,
      colours: outputFormat === "png" ? pngColors : null,
    });
    const sourceIds = new Set(images.map(({ id }) => id));
    for (const [id, entry] of cache.current) {
      if (!sourceIds.has(id) || entry.key !== key) cache.current.delete(id);
    }
    setResizedImages([]);
    setProcessingErrors([]);
    setProcessingTime(0);
    setProgress(0);
    setCancelled(false);
    setIsProcessing(images.length > 0);

    const run = async () => {
      const results = [];
      const failures = [];
      const start = performance.now(); // Include cache lookups in the batch time.
      try {
        for (const source of images) {
          if (!job.isCurrent()) return;
          try {
            const result =
              cache.current.get(source.id)?.result ??
              (await resizeImage(source, settings, job.signal));
            if (!job.isCurrent()) return;
            cache.current.set(source.id, { key, result });
            results.push(result);
          } catch (error) {
            if (!job.isCurrent()) return;
            failures.push(error.message);
          }
          setProgress(results.length + failures.length);
          setResizedImages([...results]);
          setProcessingErrors([...failures]);
        }
      } finally {
        // Superseded jobs must not publish results or unlock the current job.
        if (job.isCurrent()) {
          setProcessingTime(
            Number(((performance.now() - start) / 1000).toFixed(2))
          );
          setIsProcessing(false);
        }
      }
    };
    void run();
    return () => owner.cancel();
  }, [
    images,
    boundingBox,
    outputFormat,
    compressionLevel,
    pngColors,
    disableUpscale,
    retry,
  ]);

  useEffect(() => {
    const owner = zipOwner.current;
    return () => owner.cancel();
  }, []);

  const changeSetting = (setter) => (value) => {
    invalidate();
    setter(value);
    // Restart even when a custom size is committed without changing its value.
    setRetry((current) => current + 1);
  };

  const handleReset = () => {
    invalidate();
    cache.current.clear();
    setImages([]);
    setResizedImages([]);
    setUploadErrors([]);
    setProcessingErrors([]);
    setProcessingTime(0);
    setIsProcessing(false);
  };

  const handleRemoveImage = (id) => {
    invalidate();
    cache.current.delete(id);
    setImages((current) => current.filter((image) => image.id !== id));
    setResizedImages((current) => current.filter((image) => image.id !== id));
  };

  const outputs = useMemo(
    () => nameOutputs(resizedImages, enableSuffix, suffix),
    [resizedImages, enableSuffix, suffix]
  );

  // ZIP work has independent ownership so reset cannot trigger a late download.
  const downloadZip = async () => {
    if (isProcessing || isZipping || !outputs.length) return;
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
    resizeOwner.current.cancel();
    setIsProcessing(false);
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
              onChange={changeSetting(setBoundingBox)}
              width={boundingBox.width}
              height={boundingBox.height}
            />
            <label>
              <input
                type="checkbox"
                checked={disableUpscale}
                onChange={() =>
                  changeSetting(setDisableUpscale)(!disableUpscale)
                }
              />
              Do not enlarge
            </label>
          </div>
          <div className={styles.controlGroup}>
            <OutputFormatSelect
              onChange={changeSetting(setOutputFormat)}
              value={outputFormat}
            />
            <CompressionSelect
              format={outputFormat}
              onChange={changeSetting(setCompressionLevel)}
              value={compressionLevel}
              pngColors={pngColors}
              onPngColorsChange={changeSetting(setPngColors)}
            />
          </div>
          <div className={styles.controlGroup}>
            <label>
              <input
                type="checkbox"
                checked={enableSuffix}
                disabled={isZipping}
                onChange={() => setEnableSuffix(!enableSuffix)}
              />
              Add suffix
            </label>
            <input
              type="text"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
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
              disabled={!outputs.length || isProcessing || isZipping || isEmpty}
              className={outputs.length ? "buttonPrimary" : undefined}
            >
              <Download size={15} aria-hidden="true" />
              {isZipping ? "Creating ZIP..." : "Download ZIP"}
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
                  setRetry((n) => n + 1);
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
        errors={[
          ...uploadErrors,
          ...processingErrors,
          ...(zipError ? [zipError] : []),
        ]}
      />
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
        resizedImages={outputs}
        loading={isProcessing}
        progress={progress}
        total={images.length}
        processingTime={processingTime}
        onFileInputChange={handleFileInputChange}
        inputDisabled={false}
        onRemoveImage={handleRemoveImage}
      />
      <div className={styles.footer}>
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
