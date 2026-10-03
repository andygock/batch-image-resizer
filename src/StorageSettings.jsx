import styles from "./App.module.css";

export default function StorageSettings({
  preferences,
  onRememberPreferences,
  onRememberBatch,
  onClearPreferences,
  onClearBatch,
  onClearLocal,
  onClearSession,
  onClearCache,
  onClearAll,
  busy,
  message,
  error,
}) {
  return (
    <details className={styles.storage} id="saved-data">
      <summary>Saved data and preferences</summary>
      <label>
        <input
          type="checkbox"
          checked={preferences.rememberPreferences}
          onChange={(event) => onRememberPreferences(event.target.checked)}
          disabled={busy}
        />
        Remember preferences on this device
      </label>
      <label>
        <input
          type="checkbox"
          checked={preferences.rememberBatch}
          onChange={(event) => onRememberBatch(event.target.checked)}
          disabled={busy}
        />
        Recover this batch after closing or reloading
      </label>
      <p>
        Source images and batch settings are saved in this browser’s IndexedDB.
        Preferences and storage choices use Local Storage. No images are
        uploaded.
      </p>
      <div className={styles.dataActions}>
        <button onClick={onClearPreferences} disabled={busy}>
          Clear saved preferences
        </button>
        <button onClick={onClearBatch} disabled={busy}>
          Clear IndexedDB batch
        </button>
        <button onClick={onClearLocal} disabled={busy}>
          Clear app Local Storage
        </button>
        <button onClick={onClearSession} disabled={busy}>
          Clear app Session Storage
        </button>
        <button onClick={onClearCache} disabled={busy}>
          Clear cached results and undo history
        </button>
        <button onClick={onClearAll} disabled={busy}>
          Clear all app data and current batch
        </button>
      </div>
      <p>
        Clearing a saved category also stops saving it. Turning remembering off
        is remembered as a storage choice. Clearing Local Storage removes those
        choices too; saving stays off for this visit until enabled again.
        Clearing all also removes the current batch and its undo history.
      </p>
      <p>
        Only this application’s data is removed. Files already downloaded and
        data belonging to other applications are kept.
      </p>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
