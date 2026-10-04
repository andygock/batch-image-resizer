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
  const sharpeningFields = [
    { key: "amount", label: "Sharpening amount", min: 0, max: 2, step: 0.1 },
    {
      key: "radius",
      label: "Radius (output pixels)",
      min: 0.3,
      max: 3,
      step: 0.1,
    },
    { key: "threshold", label: "Threshold (0–255)", min: 0, max: 255, step: 1 },
  ];
  const valid =
    !draft.sharpen ||
    sharpeningFields.every(
      ({ key, min, max, step }) =>
        typeof draft[key] === "number" &&
        Number.isFinite(draft[key]) &&
        draft[key] >= min &&
        draft[key] <= max &&
        (step !== 1 || Number.isInteger(draft[key])),
    );
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
      <label>
        <input
          type="checkbox"
          checked={draft.sharpen}
          onChange={(event) =>
            setDraft({ ...draft, sharpen: event.target.checked })
          }
        />
        Sharpen after resizing
      </label>
      <p>
        Unsharp masking restores edge contrast before encoding. Start with a low
        amount; the threshold leaves small colour differences untouched.
        Transparency is preserved.
      </p>
      {sharpeningFields.map(({ key, label, min, max, step }) => (
        <div className={styles.field} key={key}>
          <label htmlFor={`sharpen-${key}`}>{label}</label>
          <input
            id={`sharpen-${key}`}
            type="number"
            min={min}
            max={max}
            step={step}
            disabled={!draft.sharpen}
            value={draft[key]}
            onChange={(event) =>
              setDraft({
                ...draft,
                [key]:
                  event.target.value === "" ? "" : Number(event.target.value),
              })
            }
          />
        </div>
      ))}
      {!valid && (
        <p role="alert">
          Enter an amount from 0 to 2, a radius from 0.3 to 3, and a
          whole-number threshold from 0 to 255.
        </p>
      )}
      <div className={styles.actions}>
        <button onClick={() => setDraft({ ...DEFAULT_PROCESSING })}>
          Reset processing
        </button>
        <span />
        <button onClick={onClose}>Cancel</button>
        <button
          className="buttonPrimary"
          disabled={!valid}
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
