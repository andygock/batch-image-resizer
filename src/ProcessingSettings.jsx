import styles from "./AdvancedSettings.module.css";
import {
  DEFAULT_PROCESSING,
  SHARPENING_FIELDS,
  validProcessingField,
} from "./processingSettings.js";

export default function ProcessingSettings({
  value: draft,
  onChange: setDraft,
}) {
  const advanced = draft.method === "lanczos3" || draft.method === "mitchell";
  return (
    <div className={styles.body}>
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
      {SHARPENING_FIELDS.map(({ key, label, min, max, step }) => (
        <div className={styles.field} key={key}>
          <label htmlFor={`sharpen-${key}`}>{label}</label>
          <input
            id={`sharpen-${key}`}
            type="number"
            min={min}
            max={max}
            step={step}
            disabled={!draft.sharpen}
            aria-invalid={
              draft.sharpen &&
              !validProcessingField({ min, max, step }, draft[key])
            }
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
      <button type="button" onClick={() => setDraft({ ...DEFAULT_PROCESSING })}>
        Reset processing
      </button>
      <p>Changes remain a draft until you apply these settings.</p>
    </div>
  );
}
