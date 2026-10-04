import saveAs from "file-saver";
import { Download, Pause, Play, Settings, Trash2, Upload } from "lucide-preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import styles from "./App.module.css";
import { resolveSettings, settingsKey } from "./batchProcessor.js";
import CompressionSelect from "./CompressionSelect";
import { archiveFilename } from "./downloads.js";
import Errors from "./Errors";
import ImageInspector from "./ImageInspector.jsx";
import { nameOutputs, outputFormats } from "./imageUtils.js";
import OutputFormatSelect from "./OutputFormatSelect";
import OutputImages from "./OutputImages";
import SizeSelect from "./SizeSelect";
import StorageSettings from "./StorageSettings.jsx";
import { updateSelection } from "./selection.js";
import useBatchProcessor from "./useBatchProcessor.js";
import { useDragAndDrop } from "./useDragAndDrop";
import useImageImports from "./useImageImports.js";
import usePreferences from "./usePreferences.js";
import { createZipExporter } from "./zipExporter.js";

function App() {
  const [images, setImages] = useState([]);
  const [zipState, setZipState] = useState({
    isZipping: false,
    error: "",
    progress: 0,
  });
  const { isZipping, error: zipError } = zipState;
  const {
    preferences,
    setPreference,
    applyPreferences,
    forgetPreferences,
    storageError,
  } = usePreferences();
  const {
    boundingBox,
    outputFormat,
    qualityByFormat,
    pngColors,
    enableSuffix,
    suffix,
    disableUpscale,
    recentSizes,
  } = preferences;
  const [cancelled, setCancelled] = useState(false);
  const [retry, setRetry] = useState({ ids: [] });
  const [sizeDraft, setSizeDraft] = useState({ invalid: false, dirty: false });
  const nameAssignments = useRef(new Map());
  const [selected, setSelected] = useState(new Set());
  const [inspectedId, setInspectedId] = useState(null);
  const [dataMessage, setDataMessage] = useState("");
  const [storageOpen, setStorageOpen] = useState(false);
  const inspectedSource = images.find(({ id }) => id === inspectedId);
  const selectionAnchor = useRef(null);
  const dropRef = useRef(null);
  const zipExporter = useRef(null);
  if (!zipExporter.current) zipExporter.current = createZipExporter(saveAs);
  const settings = useMemo(
    () => ({
      bounds: boundingBox,
      format: outputFormat,
      qualityByFormat,
      colours: pngColors,
      disableUpscale,
    }),
    [boundingBox, outputFormat, qualityByFormat, pngColors, disableUpscale],
  );
  const { records, isProcessing, progress, processingTime, processor } =
    useBatchProcessor(images, settings, cancelled, retry);
  const resizedImages = useMemo(
    () =>
      images.flatMap((source) =>
        records[source.id]?.status === "ready" &&
        records[source.id].key ===
          settingsKey(resolveSettings(source, settings))
          ? [records[source.id].result]
          : [],
      ),
    [images, records, settings],
  );
  const failedIds = images
    .filter(({ id }) => records[id]?.status === "error")
    .map(({ id }) => id);
  const retryImages = (ids) => {
    processor.cancel();
    setCancelled(false);
    setRetry({ ids });
  };
  const namedSources = useMemo(
    () =>
      nameOutputs(
        images.map(({ id, file, sourceFormat }) => ({
          id,
          filename: file.name,
          outputExtension:
            outputFormats[
              outputFormat === "source" ? sourceFormat : outputFormat
            ]?.extension,
        })),
        enableSuffix,
        suffix,
        nameAssignments.current,
      ),
    [images, outputFormat, enableSuffix, suffix],
  );
  const invalidate = useCallback(() => {
    processor.cancel();
  }, [processor]);

  const {
    addFiles: handleImageUpload,
    cancelImports,
    isImporting,
    errors: uploadErrors,
    clearErrors,
    duplicates,
    dismissDuplicates,
  } = useImageImports((accepted) => {
    invalidate();
    setImages((current) => [
      ...current,
      ...accepted.map((source) => ({ ...source, id: crypto.randomUUID() })),
    ]);
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
    const exporter = zipExporter.current;
    return () => exporter.cancel(false);
  }, []);

  const changeSetting = (key) => (value) => {
    if (JSON.stringify(preferences[key]) === JSON.stringify(value)) return;
    invalidate();
    setPreference(key, value);
  };

  const handleRemoveImages = (ids) => {
    invalidate();
    const removed = new Set(ids);
    processor.remove(ids);
    zipExporter.current.cancel();
    cancelImports();
    for (const id of ids) nameAssignments.current.delete(id);
    if (removed.has(inspectedId)) setInspectedId(null);
    if (removed.has(selectionAnchor.current)) selectionAnchor.current = null;
    const restoreFocus = ids.some((id) =>
      document.getElementById(`image-${id}`)?.contains(document.activeElement),
    );
    const focusedIndex = images.findIndex(({ id }) =>
      document.getElementById(`image-${id}`)?.contains(document.activeElement),
    );
    const nextId =
      images.slice(focusedIndex + 1).find(({ id }) => !removed.has(id))?.id ??
      images
        .slice(0, focusedIndex)
        .reverse()
        .find(({ id }) => !removed.has(id))?.id;
    setImages((current) => current.filter((image) => !removed.has(image.id)));
    setSelected(
      (current) => new Set([...current].filter((id) => !removed.has(id))),
    );
    if (restoreFocus)
      requestAnimationFrame(() => {
        const target = nextId
          ? document.getElementById(`image-${nextId}`)?.querySelector("input")
          : document.getElementById("add-images");
        target?.focus({ preventScroll: true });
      });
  };

  const outputNames = useMemo(
    () =>
      new Map(
        namedSources.map(({ id, downloadFilename }) => [id, downloadFilename]),
      ),
    [namedSources],
  );
  const outputs = useMemo(
    () =>
      resizedImages.map((image) => ({
        ...image,
        downloadFilename: outputNames.get(image.id),
      })),
    [resizedImages, outputNames],
  );

  // Exports own their output snapshot; deleting images explicitly cancels it.
  const downloadZip = async (selection) => {
    if (isZipping || !outputs.length || sizeDraft.invalid) return;
    const targets = selection
      ? outputs.filter(({ id }) => selection.has(id))
      : outputs;
    await zipExporter.current.start(
      targets,
      archiveFilename(targets),
      setZipState,
    );
  };

  const cancelResize = () => {
    processor.cancel();
    setCancelled(true);
  };
  const isEmpty = images.length === 0;
  const clearBatch = () => {
    cancelImports();
    processor.clear();
    zipExporter.current.cancel(false);
    nameAssignments.current.clear();
    setImages([]);
    setSelected(new Set());
    selectionAnchor.current = null;
    setInspectedId(null);
    setCancelled(false);
    setRetry({ ids: [] });
    setZipState({ isZipping: false, progress: 0, error: "" });
    setDataMessage("");
  };

  return (
    <div ref={dropRef} className={styles.app}>
      <div className={styles.header}>
        <h1 className={styles.title}>Batch Image Resizer</h1>
        <div className={styles.config}>
          <div className={styles.controlGroup}>
            <SizeSelect
              onChange={changeSetting("boundingBox")}
              recentSizes={recentSizes}
              onDraftStateChange={setSizeDraft}
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
              No upscale
            </label>
          </div>
          <div className={styles.controlGroup}>
            <OutputFormatSelect
              onChange={changeSetting("outputFormat")}
              value={outputFormat}
            />
            <CompressionSelect
              compact
              format={outputFormat}
              onQualityChange={(format, quality) =>
                changeSetting("qualityByFormat")({
                  ...qualityByFormat,
                  [format]: quality,
                })
              }
              qualityByFormat={qualityByFormat}
              sourceFormats={images.map(({ sourceFormat }) => sourceFormat)}
              pngColors={pngColors}
              onPngColorsChange={changeSetting("pngColors")}
            />
          </div>
          <div className={styles.controlGroup}>
            <label>
              <input
                type="checkbox"
                checked={enableSuffix}
                onChange={() => {
                  setPreference("enableSuffix", !enableSuffix);
                }}
              />
              Suffix
            </label>
            <input
              type="text"
              value={suffix}
              onChange={(e) => {
                setPreference("suffix", e.target.value);
              }}
              aria-label="Filename suffix"
              placeholder="Suffix"
              maxLength={100}
              disabled={!enableSuffix}
              className={styles.suffix}
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button
            onClick={() => downloadZip()}
            disabled={
              !outputs.length || isZipping || isEmpty || sizeDraft.invalid
            }
            className={outputs.length ? "buttonPrimary" : undefined}
            title={`Download ${outputs.length} ready images as ZIP`}
            aria-label={`Download ${outputs.length} ready images as ZIP`}
          >
            <Download size={15} aria-hidden="true" />
            {isZipping
              ? `ZIP ${zipState.progress}%`
              : `ZIP (${outputs.length})`}
          </button>
          <button
            className={styles.clearButton}
            onClick={clearBatch}
            disabled={isEmpty && !isImporting && !isZipping}
            aria-label="Clear current batch"
            title="Clear current images"
          >
            <Trash2 size={15} aria-hidden="true" />
            <span>Clear</span>
          </button>
          <button
            className={styles.pauseButton}
            disabled={!isProcessing && !cancelled}
            aria-label={cancelled ? "Resume processing" : "Pause processing"}
            title={
              !isProcessing && !cancelled
                ? "No images are waiting to be processed"
                : cancelled
                  ? "Resume processing"
                  : "Pause processing"
            }
            onClick={() => {
              if (!cancelled) {
                cancelResize();
                return;
              }
              invalidate();
              setCancelled(false);
              setRetry({ ids: [] });
            }}
          >
            {cancelled ? (
              <Play size={15} aria-hidden="true" />
            ) : (
              <Pause size={15} aria-hidden="true" />
            )}
            <span className={styles.compactText}>
              {cancelled ? "Resume" : "Pause"}
            </span>
          </button>
          <label
            className="button"
            title={isEmpty ? "Load images" : "Add images"}
          >
            <input
              type="file"
              id="add-images"
              aria-label={isEmpty ? "Load images" : "Add images"}
              accept="image/jpeg, image/png, image/webp"
              multiple
              onChange={handleFileInputChange}
            />
            <Upload size={15} aria-hidden="true" />
            <span>{isEmpty ? "Load" : "Add"}</span>
          </label>
          <button
            className="buttonIcon"
            aria-label="Saved preferences"
            title="Saved preferences"
            aria-haspopup="dialog"
            onClick={() => setStorageOpen(true)}
          >
            <Settings size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      {dataMessage && !storageOpen && <p role="status">{dataMessage}</p>}
      {isZipping && (
        <div className={styles.statusBar}>
          <span role="status">
            Creating {zipState.filename} from {zipState.count} images ·{" "}
            {zipState.progress}%
          </span>
          <progress
            aria-label="ZIP creation"
            value={zipState.progress}
            max="100"
          />
          <button onClick={() => zipExporter.current.cancel()}>
            Cancel export
          </button>
        </div>
      )}
      {!isZipping && zipState.message && (
        <p role="status">{zipState.message}</p>
      )}
      {sizeDraft.dirty && (
        <p role="status">
          {sizeDraft.message ||
            "Press Enter in a dimension field to apply the new size."}{" "}
          Current output: {boundingBox.width}×{boundingBox.height}px. Escape
          restores the applied dimensions.
        </p>
      )}
      {storageError && <p role="alert">{storageError}</p>}
      <Errors
        onDismiss={() => {
          clearErrors();
          setZipState((current) => ({ ...current, error: "" }));
        }}
        errors={[...uploadErrors, ...(zipError ? [zipError] : [])]}
      />
      {isImporting && <p role="status">Checking image files…</p>}
      {duplicates.length > 0 && (
        <div className={styles.statusBar}>
          <span role="status">
            Skipped {duplicates.length} identical{" "}
            {duplicates.length === 1 ? "image" : "images"} already in the batch.
          </span>
          <button
            onClick={() => {
              handleImageUpload(duplicates, true);
              dismissDuplicates();
            }}
          >
            Add duplicates anyway
          </button>
          <button onClick={dismissDuplicates}>Dismiss</button>
        </div>
      )}
      {cancelled && (
        <div className={styles.status} role="status">
          Paused. Changes will wait until you resume.{" "}
          <span className="numeric">
            {progress} of {images.length}
          </span>{" "}
          images processed.
        </div>
      )}
      <div className={styles.workspace}>
        <section className={styles.results}>
          <OutputImages
            images={images}
            records={records}
            downloadsBlocked={sizeDraft.invalid}
            outputNames={outputNames}
            onInspect={setInspectedId}
            resizedImages={outputs}
            loading={isProcessing}
            progress={progress}
            total={images.length}
            processingTime={processingTime}
            onFileInputChange={handleFileInputChange}
            inputDisabled={false}
            onRemoveImage={(id) => handleRemoveImages([id])}
            selected={selected}
            onSelectImage={(id, extend) => {
              const anchor = selectionAnchor.current;
              setSelected((current) =>
                updateSelection(
                  current,
                  images.map((image) => image.id),
                  anchor,
                  id,
                  extend,
                ),
              );
              selectionAnchor.current = id;
            }}
            onSelectAll={() => {
              setSelected(new Set(images.map(({ id }) => id)));
            }}
            onClearSelection={() => {
              setSelected(new Set());
            }}
            onRemoveSelected={() => handleRemoveImages([...selected])}
            onDownloadSelected={() => downloadZip(selected)}
            isZipping={isZipping}
            viewMode={preferences.viewMode}
            onViewModeChange={(value) => {
              setPreference("viewMode", value);
            }}
            onRetryImage={(id) => retryImages([id])}
            onRetryFailed={() => retryImages(failedIds)}
          />
        </section>
        {inspectedSource && (
          <ImageInspector
            source={inspectedSource}
            batchResult={records[inspectedId]?.result}
            settings={settings}
            processor={processor}
            index={images.indexOf(inspectedSource)}
            total={images.length}
            onNavigate={(direction) =>
              setInspectedId(
                images[images.indexOf(inspectedSource) + direction]?.id ??
                  inspectedId,
              )
            }
            onClose={() => {
              setInspectedId(null);
              requestAnimationFrame(() =>
                document
                  .getElementById(`image-${inspectedId}`)
                  ?.querySelector("button")
                  ?.focus({ preventScroll: true }),
              );
            }}
            onApply={(options) => {
              invalidate();
              applyPreferences((current) => ({
                ...current,
                outputFormat: options.format,
                qualityByFormat: options.qualityByFormat,
                pngColors: options.colours,
              }));
            }}
          />
        )}
      </div>
      {storageOpen && (
        <StorageSettings
          onClose={() => setStorageOpen(false)}
          preferences={preferences}
          message={dataMessage}
          error={storageError}
          onRememberPreferences={(enabled) =>
            setPreference("rememberPreferences", enabled)
          }
          onClearPreferences={() => {
            if (forgetPreferences())
              setDataMessage(
                "Saved preferences cleared. Current settings remain in this tab; preference saving is off.",
              );
          }}
        />
      )}
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
