import { useEffect, useState } from "react";
import { MAX_DIMENSION, validateSize } from "./imageUtils.js";
import styles from "./SizeSelect.module.css";

const sizes = [
  [256, 256],
  [384, 384],
  [512, 512],
  [640, 640],
  [800, 800],
  [1024, 1024],
  [1280, 1280],
  [1920, 1080],
];

export default function SizeSelect({
  onChange,
  width: selectedWidth,
  height: selectedHeight,
  disabled,
}) {
  const [isCustom, setIsCustom] = useState(false);
  const [draft, setDraft] = useState({
    width: String(selectedWidth),
    height: String(selectedHeight),
  });
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft({ width: String(selectedWidth), height: String(selectedHeight) });
    setError("");
  }, [selectedWidth, selectedHeight]);
  const selectedValue = `${selectedWidth}x${selectedHeight}`;
  const isPreset = sizes.some(
    ([optionWidth, optionHeight]) =>
      `${optionWidth}x${optionHeight}` === selectedValue
  );
  const value = isCustom || !isPreset ? "custom" : selectedValue;

  const commitCustomSize = () => {
    const size = { width: Number(draft.width), height: Number(draft.height) };
    try {
      validateSize(size);
      setError("");
      if (size.width !== selectedWidth || size.height !== selectedHeight)
        onChange(size);
    } catch (failure) {
      setError(failure.message);
    }
  };

  return (
    <div className={styles.control}>
      <label htmlFor="size">
        Max size
        <select
          id="size"
          className="numeric"
          onChange={(e) => {
            if (e.target.value === "custom") {
              setIsCustom(true);
              return;
            }

            setIsCustom(false);
            setError("");
            const [width, height] = e.target.value
              .split("x")
              .map((size) => parseInt(size, 10));
            onChange({ width, height });
          }}
          value={value}
          disabled={disabled === true}
        >
          {sizes.map(([optionWidth, optionHeight], index) => (
            <option key={index} value={`${optionWidth}x${optionHeight}`}>
              {optionWidth}x{optionHeight}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>

      {value === "custom" && (
        <div className={styles.custom}>
          <label htmlFor="custom-width" className="visuallyHidden">
            Custom width
          </label>
          <input
            id="custom-width"
            className="numeric"
            type="number"
            min="1"
            max={MAX_DIMENSION}
            step="1"
            value={draft.width}
            onChange={(e) => setDraft({ ...draft, width: e.target.value })}
            onBlur={commitCustomSize}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCustomSize();
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "size-error" : undefined}
            disabled={disabled === true}
          />
          <span aria-hidden="true">x</span>
          <label htmlFor="custom-height" className="visuallyHidden">
            Custom height
          </label>
          <input
            id="custom-height"
            className="numeric"
            type="number"
            min="1"
            max={MAX_DIMENSION}
            step="1"
            value={draft.height}
            onChange={(e) => setDraft({ ...draft, height: e.target.value })}
            onBlur={commitCustomSize}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCustomSize();
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "size-error" : undefined}
            disabled={disabled === true}
          />
        </div>
      )}
      {error && (
        <span id="size-error" className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
