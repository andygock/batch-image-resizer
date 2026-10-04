import { useId, useState } from "react";
import styles from "./AdvancedSettings.module.css";
import {
  ADVANCED_FIELDS,
  DEFAULT_ADVANCED,
  sanitiseAdvanced,
  validAdvancedValue,
} from "./advancedSettings.js";
import CompressionSelect from "./CompressionSelect.jsx";
import Modal from "./Modal.jsx";
import ProcessingSettings from "./ProcessingSettings.jsx";
import { DEFAULT_PREFERENCES } from "./preferences.js";

const names = { webp: "WebP", jpeg: "JPEG", png: "PNG", avif: "AVIF" };
const primary = new Set([
  "encoder",
  "background",
  "mode",
  "method",
  "losslessQuality",
  "nearLossless",
  "progressive",
  "subsampling",
  "dither",
  "level",
  "interlace",
  "optimiseAlpha",
  "speed",
  "alphaQuality",
]);

function Field({ field, value, onChange, disabled }) {
  const id = useId();
  const valid = validAdvancedValue(field, value);
  const props = {
    id,
    disabled,
    "aria-describedby": `${id}-hint`,
    "aria-invalid": !disabled && !valid,
  };
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {field.type === "checkbox" && (
          <input
            {...props}
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
          />
        )}
        {field.label}
      </label>
      {field.type === "select" ? (
        <select
          {...props}
          value={value}
          onChange={(e) =>
            onChange(
              field.options.find(
                ([option]) => String(option) === e.target.value,
              )[0],
            )
          }
        >
          {field.options.map(([option, label]) => (
            <option key={option} value={option}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        field.type !== "checkbox" && (
          <input
            {...props}
            type={field.type}
            value={value}
            min={field.min}
            max={field.max}
            step={1}
            onChange={(e) =>
              onChange(
                field.type === "number"
                  ? e.target.value === ""
                    ? ""
                    : Number(e.target.value)
                  : e.target.value,
              )
            }
          />
        )
      )}
      <small id={`${id}-hint`}>
        {!disabled && !valid
          ? `Enter a whole number from ${field.min} to ${field.max}.`
          : field.hint}
      </small>
    </div>
  );
}

function visible(key, field, selected) {
  return (
    (key === "encoder" ||
      key === "background" ||
      selected.encoder !== "browser") &&
    (!field.when || field.when(selected))
  );
}

export default function AdvancedSettings({
  settings,
  onApply,
  onClose,
  trial = false,
  initialFormat = settings.format === "source" ? "webp" : settings.format,
}) {
  const [format, setFormat] = useState(initialFormat);
  const [processingOpen, setProcessingOpen] = useState(false);
  const [draft, setDraft] = useState(() => ({
    ...settings,
    advanced: sanitiseAdvanced(settings.advanced),
  }));
  const options = draft.advanced[format];
  const fields = ADVANCED_FIELDS[format];
  const change = (key, value) =>
    setDraft((current) => ({
      ...current,
      advanced: {
        ...current.advanced,
        [format]: { ...current.advanced[format], [key]: value },
      },
    }));
  const valid = Object.entries(draft.advanced).every(([type, values]) =>
    Object.entries(ADVANCED_FIELDS[type]).every(
      ([key, field]) =>
        !visible(key, field, values) ||
        (type === "png" && key === "dither" && !draft.colours) ||
        validAdvancedValue(field, values[key]),
    ),
  );
  const renderFields = (main) =>
    Object.entries(fields)
      .filter(
        ([key, field]) =>
          primary.has(key) === main && visible(key, field, options),
      )
      .map(([key, field]) => (
        <Field
          key={key}
          field={field}
          value={options[key]}
          onChange={(value) => change(key, value)}
          disabled={format === "png" && key === "dither" && !draft.colours}
        />
      ));
  const preset = (value) => {
    if (!value) return;
    const overrides =
      format === "webp"
        ? {
            photo: {
              sns: 80,
              filterStrength: 35,
              filterSharpness: 3,
              sharpYuv: false,
            },
            drawing: {
              sns: 25,
              filterStrength: 10,
              filterSharpness: 6,
              sharpYuv: true,
            },
            text: {
              sns: 0,
              filterStrength: 0,
              filterSharpness: 0,
              sharpYuv: true,
            },
          }[value]
        : {
            fast: {
              trellisMultipass: false,
              trellisOptZero: false,
              trellisOptTable: false,
              trellisLoops: 1,
            },
            balanced: {
              trellisMultipass: true,
              trellisOptZero: false,
              trellisOptTable: false,
              trellisLoops: 1,
            },
            best: {
              trellisMultipass: true,
              trellisOptZero: true,
              trellisOptTable: true,
              trellisLoops: 2,
            },
          }[value];
    setDraft((current) => ({
      ...current,
      advanced: {
        ...current.advanced,
        [format]: {
          ...current.advanced[format],
          ...overrides,
          ...(format === "webp" ? { autofilter: false } : {}),
        },
      },
    }));
  };
  return (
    <Modal
      title="Advanced output settings"
      onClose={onClose}
      className={styles.modal}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <p className={styles.intro}>
        Settings are saved per format.{" "}
        {trial
          ? "Apply to trial to preview this image before changing the batch."
          : "Apply once to update the batch."}{" "}
        Images stay on this device.
      </p>
      <div className={styles.formats} role="group" aria-label="Format settings">
        {Object.entries(names).map(([key, name]) => (
          <button
            key={key}
            aria-pressed={format === key}
            onClick={() => setFormat(key)}
          >
            {name}
          </button>
        ))}
      </div>
      <button onClick={() => setProcessingOpen(true)} aria-haspopup="dialog">
        Image processing
      </button>
      {processingOpen && (
        <ProcessingSettings
          value={draft.processing}
          onApply={(processing) => setDraft({ ...draft, processing })}
          onClose={() => setProcessingOpen(false)}
        />
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) {
            onApply({ ...draft, advanced: sanitiseAdvanced(draft.advanced) });
            onClose();
          }
        }}
      >
        <div className={styles.body} key={format}>
          <p className={styles.intro}>
            Editing {names[format]} settings does not change the selected output
            format.
          </p>
          <div className={styles.quality}>
            <CompressionSelect
              compact
              format={format}
              idPrefix="advanced-"
              qualityByFormat={draft.qualityByFormat}
              advanced={draft.advanced}
              pngColors={draft.colours}
              onPngColorsChange={(colours) => setDraft({ ...draft, colours })}
              onQualityChange={(type, quality) =>
                setDraft({
                  ...draft,
                  qualityByFormat: {
                    ...draft.qualityByFormat,
                    [type]: quality,
                  },
                })
              }
            />
          </div>
          <div className={styles.grid}>{renderFields(true)}</div>
          {options.encoder === "browser" && (
            <p className={styles.intro}>
              Choose the advanced encoder to control compression details. It
              loads locally on demand and can take longer than browser encoding.
            </p>
          )}
          {(options.encoder === "advanced" || format === "avif") && (
            <>
              {(format === "jpeg" || options.mode === "lossy") && (
                <label className={styles.preset}>
                  Apply a starting preset
                  <select
                    aria-label={`${names[format]} starting preset`}
                    value=""
                    onChange={(e) => preset(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {(format === "webp"
                      ? [
                          ["photo", "Photo"],
                          ["drawing", "Drawing"],
                          ["text", "Text"],
                        ]
                      : [
                          ["fast", "Fast"],
                          ["balanced", "Balanced"],
                          ["best", "Best compression"],
                        ]
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <details className={styles.details}>
                <summary>Fine tuning</summary>
                <div className={styles.grid}>{renderFields(false)}</div>
              </details>
            </>
          )}
        </div>
        {!valid && (
          <p role="alert">
            Correct the invalid advanced settings before applying. Check each
            format if needed.
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                colours:
                  format === "png"
                    ? DEFAULT_PREFERENCES.pngColors
                    : draft.colours,
                qualityByFormat:
                  format === "png"
                    ? draft.qualityByFormat
                    : {
                        ...draft.qualityByFormat,
                        [format]: DEFAULT_PREFERENCES.qualityByFormat[format],
                      },
                advanced: {
                  ...draft.advanced,
                  [format]: { ...DEFAULT_ADVANCED[format] },
                },
              })
            }
          >
            Reset {names[format]}
          </button>
          <span />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="buttonPrimary" type="submit" disabled={!valid}>
            {trial ? "Apply to trial" : "Apply settings"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
