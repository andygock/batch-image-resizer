import saveAs from "file-saver";
import { Download, Pause, Play, Settings, Trash2, Upload } from "lucide-preact";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import styles from "./App.module.css";
import { resolveSettings, settingsKey } from "./batchProcessor.js";
import CompressionSelect from "./CompressionSelect";
import { archiveFilename, downloadRequestKey } from "./downloads.js";
import Errors from "./Errors";
import ImageInspector from "./ImageInspector.jsx";
import { nameOutputs, outputFormats } from "./imageUtils.js";
import OutputFormatSelect from "./OutputFormatSelect";
import OutputImages from "./OutputImages";
import { DEFAULT_PREFERENCES, sanitisePreferences } from "./preferences.js";
import SizeSelect from "./SizeSelect";
import StorageSettings from "./StorageSettings.jsx";
import { updateSelection } from "./selection.js";
import { STORAGE_CHANNEL } from "./storagePrivacy.js";
import { appendUndo, restoreRemovedSources } from "./undoHistory.js";
import useBatchProcessor from "./useBatchProcessor.js";
import useBatchRecovery from "./useBatchRecovery.js";
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
    restorePreferences,
    applyPreferences,
    forgetPreferences,
    pauseStorage,
    clearLocalData,
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
  const [undoHistory, setUndoHistory] = useState([]);
  const nameAssignments = useRef(new Map());
  const [selected, setSelected] = useState(new Set());
  const [downloadRequests, setDownloadRequests] = useState(new Set());
  const [inspectedId, setInspectedId] = useState(null);
  const [dataMessage, setDataMessage] = useState("");
  const [clearingData, setClearingData] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const storageChannel = useRef(null);
  const inspectedSource = images.find(({ id }) => id === inspectedId);
  const selectionAnchor = useRef(null);
  const selectedIds = useMemo(() => [...selected], [selected]);
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
    markChanged();
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
  const downloadContext = useMemo(
    () => ({
      names: namedSources.map(({ id }) => [
        id,
        nameAssignments.current.get(id),
      ]),
      requests: [...downloadRequests],
    }),
    [namedSources, downloadRequests],
  );
  const recovery = useBatchRecovery(
    images,
    preferences,
    (saved) => {
      restorePreferences({
        ...saved.preferences,
        rememberPreferences: preferences.rememberPreferences,
        rememberBatch: preferences.rememberBatch,
      });
      setCancelled(saved.paused);
      setSelected(new Set(saved.selectedIds));
      nameAssignments.current = new Map(saved.downloadContext.names);
      setDownloadRequests(new Set(saved.downloadContext.requests));
      setImages(saved.sources);
    },
    setPreference,
    cancelled,
    selectedIds,
    downloadContext,
  );
  const { markChanged } = recovery;
  const { pauseSaving } = recovery;
  useEffect(() => {
    if (typeof BroadcastChannel !== "function") return;
    let channel;
    try {
      channel = new BroadcastChannel(STORAGE_CHANNEL);
    } catch {
      return;
    }
    storageChannel.current = channel;
    channel.onmessage = ({ data }) => {
      if (!["preferences", "local", "batch", "all"].includes(data)) return;
      pauseStorage(data);
      if (data === "batch" || data === "all") pauseSaving();
      setDataMessage(
        "Saved data was cleared in another tab. Saving the affected data has been paused here too.",
      );
    };
    return () => {
      channel.close();
      storageChannel.current = null;
    };
  }, [pauseStorage, pauseSaving]);

  const invalidate = useCallback(() => {
    markChanged();
    processor.cancel();
  }, [processor, markChanged]);

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

  const handleReset = () => {
    rememberRemoval(
      images.map(({ id }) => id),
      true,
    );
    cancelImports();
    invalidate();
    processor.clear();
    nameAssignments.current.clear();
    setCancelled(false);
    setImages([]);
    setSelected(new Set());
  };

  const handleRemoveImages = (ids) => {
    rememberRemoval(ids);
    invalidate();
    const removed = new Set(ids);
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
  const rememberRemoval = (ids, cleared = false) => {
    const removedIds = new Set(ids);
    const removed = images.flatMap((source, index) =>
      removedIds.has(source.id) ? [{ source, index }] : [],
    );
    if (!removed.length) return;
    const entry = {
      removed,
      outputs: processor.capture(ids),
      names: ids.map((id) => [id, nameAssignments.current.get(id)]),
      selection: ids.filter((id) => selected.has(id)),
      paused: cleared ? cancelled : null,
    };
    setUndoHistory((current) => appendUndo(current, entry));
  };
  const undoRemoval = useCallback(() => {
    const entry = undoHistory.at(-1);
    if (!entry) return;
    invalidate();
    processor.restore(entry.outputs);
    for (const [id, name] of entry.names) {
      if (
        name &&
        ![...nameAssignments.current.values()].some(
          (existing) => existing.name.toLowerCase() === name.name.toLowerCase(),
        )
      )
        nameAssignments.current.set(id, name);
    }
    setImages((current) => restoreRemovedSources(current, entry.removed));
    setSelected((current) => new Set([...current, ...entry.selection]));
    if (entry.paused !== null) setCancelled(entry.paused);
    setUndoHistory((current) => current.slice(0, -1));
  }, [undoHistory, invalidate, processor]);
  useEffect(() => {
    const handleUndo = (event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z" &&
        !event.target.closest?.(
          "input, textarea, select, [contenteditable='true']",
        ) &&
        undoHistory.length
      ) {
        event.preventDefault();
        undoRemoval();
      }
    };
    document.addEventListener("keydown", handleUndo);
    return () => document.removeEventListener("keydown", handleUndo);
  }, [undoRemoval, undoHistory.length]);

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

  // Exports own their output snapshot so editing the next batch cannot cancel them.
  const downloadZip = async (selection) => {
    if (isZipping || !outputs.length || sizeDraft.invalid) return;
    const targets = selection
      ? outputs.filter(({ id }) => selection.has(id))
      : outputs;
    const snapshot = await zipExporter.current.start(
      targets,
      archiveFilename(targets),
      setZipState,
    );
    if (snapshot) markDownloads(snapshot);
  };
  const markDownloads = (items) => {
    markChanged();
    setDownloadRequests(
      (current) =>
        new Set([...current, ...items.map(downloadRequestKey)].slice(-2000)),
    );
  };

  const cancelResize = () => {
    markChanged();
    processor.cancel();
    setCancelled(true);
  };
  const isEmpty = images.length === 0;
  const clearCachedResults = () => {
    markChanged();
    processor.clear();
    zipExporter.current.cancel();
    setCancelled(true);
    setRetry({ ids: [] });
    setUndoHistory([]);
    setInspectedId(null);
    setDataMessage(
      "Cached outputs and undo history cleared. Source images remain; Resume rebuilds the outputs.",
    );
  };
  const clearAllData = async () => {
    setClearingData(true);
    storageChannel.current?.postMessage("all");
    pauseSaving();
    pauseStorage("all");
    cancelImports();
    processor.clear();
    zipExporter.current.cancel(false);
    nameAssignments.current.clear();
    setImages([]);
    setSelected(new Set());
    setDownloadRequests(new Set());
    setUndoHistory([]);
    setInspectedId(null);
    setCancelled(false);
    setRetry({ ids: [] });
    setZipState({ isZipping: false, progress: 0, error: "" });
    setFormResetKey((value) => value + 1);
    applyPreferences({
      ...sanitisePreferences(DEFAULT_PREFERENCES),
      rememberPreferences: false,
      rememberBatch: false,
    });
    const batchCleared = await recovery.forgetBatch(false);
    const localCleared = clearLocalData();
    setDataMessage(
      batchCleared && localCleared
        ? "All app data, current images, cached outputs and undo history cleared. Saving is off for this visit."
        : "Some storage could not be cleared. Saving is off; retry the affected clear control below.",
    );
    setClearingData(false);
  };

  return (
    <div ref={dropRef} className={styles.app}>
      <div className={styles.header}>
        <h1 className={styles.title}>Batch Image Resizer</h1>
        <div className={styles.config}>
          <div className={styles.controlGroup}>
            <SizeSelect
              key={formResetKey}
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
              key={formResetKey}
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
                  markChanged();
                  setPreference("enableSuffix", !enableSuffix);
                }}
              />
              Suffix
            </label>
            <input
              type="text"
              value={suffix}
              onChange={(e) => {
                markChanged();
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
            onClick={handleReset}
            disabled={isEmpty}
            aria-label="Clear batch"
            title="Clear batch (can be undone)"
          >
            <Trash2 size={15} aria-hidden="true" />
            <span className={styles.compactText}>Clear</span>
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
            aria-label="Saved data and preferences"
            title="Saved data and preferences"
            aria-haspopup="dialog"
            onClick={() => setStorageOpen(true)}
          >
            <Settings size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      {isZipping && (
        <div className={styles.undo}>
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
      {(storageError || recovery.error) && (
        <p role="alert">
          Saved data needs attention. Current images remain usable.{" "}
          <button onClick={() => setStorageOpen(true)}>
            Review storage options
          </button>
        </p>
      )}
      <Errors
        onDismiss={() => {
          clearErrors();
          setZipState((current) => ({ ...current, error: "" }));
        }}
        errors={[...uploadErrors, ...(zipError ? [zipError] : [])]}
      />
      {isImporting && <p role="status">Checking image files…</p>}
      {duplicates.length > 0 && (
        <div className={styles.undo}>
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
      {undoHistory.length > 0 && (
        <div className={styles.undo} role="status">
          <span>Removed {undoHistory.at(-1).removed.length} images.</span>
          <button onClick={undoRemoval}>Undo removal</button>
          <button onClick={() => setUndoHistory([])}>Dismiss</button>
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
              markChanged();
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
              markChanged();
              setSelected(new Set(images.map(({ id }) => id)));
            }}
            onClearSelection={() => {
              markChanged();
              setSelected(new Set());
            }}
            onRemoveSelected={() => handleRemoveImages([...selected])}
            onDownloadSelected={() => downloadZip(selected)}
            isZipping={isZipping}
            viewMode={preferences.viewMode}
            onViewModeChange={(value) => {
              markChanged();
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
          busy={clearingData}
          message={dataMessage || recovery.message}
          error={[storageError, recovery.error].filter(Boolean).join(" ")}
          onRememberPreferences={(enabled) => {
            if (enabled) setPreference("rememberPreferences", true);
            else {
              storageChannel.current?.postMessage("preferences");
              forgetPreferences();
            }
          }}
          onRememberBatch={(enabled) => {
            markChanged();
            if (enabled) setPreference("rememberBatch", true);
            else {
              storageChannel.current?.postMessage("batch");
              void recovery.forgetBatch();
            }
          }}
          onClearPreferences={() => {
            storageChannel.current?.postMessage("preferences");
            if (forgetPreferences())
              setDataMessage(
                "Saved preferences cleared. Current settings remain in this tab; preference saving is off.",
              );
          }}
          onClearBatch={async () => {
            storageChannel.current?.postMessage("batch");
            setClearingData(true);
            const success = await recovery.forgetBatch();
            setDataMessage(
              success
                ? "IndexedDB batch deleted. Current images remain in this tab; batch saving is off."
                : "Could not delete the batch database. Close other app tabs and try again.",
            );
            setClearingData(false);
          }}
          onClearLocal={() => {
            storageChannel.current?.postMessage("local");
            if (clearLocalData())
              setDataMessage(
                "App preferences and storage choices cleared from Local Storage. Preference saving is off for this visit.",
              );
          }}
          onClearCache={clearCachedResults}
          onClearAll={clearAllData}
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
