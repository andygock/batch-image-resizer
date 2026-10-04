import { useState } from "react";
import styles from "./AdvancedSettings.module.css";
import Modal from "./Modal.jsx";
import {
  DEFAULT_PROCESSING,
  sanitiseProcessing,
} from "./processingSettings.js";

export default function ProcessingSettings({ value, onApply, onClose }) {
  const [draft, setDraft] = useState(() => sanitiseProcessing(value));
  const advanced = draft.method === "lanczos3" || draft.method === "mitchell";
  return (
    <Modal
      title="Image processing"
      onClose={onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <p>
        These settings apply before encoding. Use the comparison preview to
        judge fine detail at 100%.
      </p>
      <div className={styles.field}>
        <label htmlFor="resize-method">Resize method</label>
        <select
          id="resize-method"
          value={draft.method}
          onChange={(event) =>
            setDraft({ ...draft, method: event.target.value })
          }
        >
          <option value="auto">Auto · browser high quality</option>
          <option value="lanczos3">Lanczos3 · sharp detail</option>
          <option value="mitchell">Mitchell · softer edges</option>
          <option value="nearest">Nearest-neighbour · pixel art</option>
        </select>
      </div>
      <label>
        <input
          type="checkbox"
          checked={draft.linearRGB}
          disabled={!advanced}
          onChange={(event) =>
            setDraft({ ...draft, linearRGB: event.target.checked })
          }
        />
        Resize in linear light
      </label>
      <p>
        Preserves brightness when mixing light and dark pixels. Available with
        Lanczos3 and Mitchell.
      </p>
      <label>
        <input
          type="checkbox"
          checked={draft.premultiply}
          disabled={!advanced}
          onChange={(event) =>
            setDraft({ ...draft, premultiply: event.target.checked })
          }
        />
        Alpha-aware resizing
      </label>
      <p>
        Weights colours by opacity to avoid fringes around transparent edges.
        Advanced methods support sources up to 33.5 megapixels.
      </p>
      <div className={styles.actions}>
        <button onClick={() => setDraft({ ...DEFAULT_PROCESSING })}>
          Reset processing
        </button>
        <span />
        <button onClick={onClose}>Cancel</button>
        <button
          className="buttonPrimary"
          onClick={() => {
            onApply(sanitiseProcessing(draft));
            onClose();
          }}
        >
          Use processing settings
        </button>
      </div>
      <p>Changes remain a draft until you apply the parent settings.</p>
    </Modal>
  );
}
