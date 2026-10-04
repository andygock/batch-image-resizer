import styles from "./App.module.css";
import Modal from "./Modal.jsx";

export default function StorageSettings({
  preferences,
  onRememberPreferences,
  onClearPreferences,
  message,
  error,
  onClose,
}) {
  return (
    <Modal title="Saved preferences" onClose={onClose}>
      <div className={styles.storage}>
        <label>
          <input
            type="checkbox"
            checked={preferences.rememberPreferences}
            onChange={(event) => onRememberPreferences(event.target.checked)}
          />
          Remember preferences on this device
        </label>
        <p>
          Menu options are saved in Local Storage. Images stay in this tab and
          are lost when you close or reload it. No images are uploaded.
        </p>
        <div className={styles.dataActions}>
          <button onClick={onClearPreferences}>Clear saved preferences</button>
        </div>
        <p>
          Clearing saved preferences keeps your current settings and pauses
          saving until you enable it again.
        </p>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
