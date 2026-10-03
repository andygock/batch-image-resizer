import { useEffect, useRef, useState } from "react";
import { MAX_DIMENSION, describeSizeDraft } from "./imageUtils.js";
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
  recentSizes = [],
  onDraftStateChange,
}) {
  const [isCustom, setIsCustom] = useState(false);
  const widthInput = useRef(null);
  const focusRequested = useRef(false);
  const [draft, setDraft] = useState({
    width: String(selectedWidth),
    height: String(selectedHeight),
  });
  useEffect(() => {
    if (isCustom && focusRequested.current) {
      widthInput.current?.focus();
      widthInput.current?.select();
      focusRequested.current = false;
    }
  }, [isCustom]);
  useEffect(() => {
    setDraft({ width: String(selectedWidth), height: String(selectedHeight) });
  }, [selectedWidth, selectedHeight]);
  const selectedValue = `${selectedWidth}x${selectedHeight}`;
  const isPreset = [
    ...sizes,
    ...recentSizes.map(({ width, height }) => [width, height]),
  ].some(
    ([optionWidth, optionHeight]) =>
      `${optionWidth}x${optionHeight}` === selectedValue,
  );
  const value = isCustom || !isPreset ? "custom" : selectedValue;
  const feedback = describeSizeDraft(draft, {
    width: selectedWidth,
    height: selectedHeight,
  });
  const invalid = value === "custom" && feedback.invalid;
  const dirty = value === "custom" && feedback.dirty;
  const message = invalid ? feedback.message : "";
  useEffect(() => {
    onDraftStateChange?.({ invalid, dirty, message });
  }, [invalid, dirty, message, onDraftStateChange]);

  const commitCustomSize = () => {
    const size = { width: Number(draft.width), height: Number(draft.height) };
    if (!feedback.invalid && feedback.dirty) onChange(size);
  };
  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitCustomSize();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft({
        width: String(selectedWidth),
        height: String(selectedHeight),
      });
    }
  };

  return (
    <div className={styles.control}>
      <label
        htmlFor="size"
        title="Maximum bounding size in pixels. Keeps proportions without cropping."
      >
        Max size
        <select
          id="size"
          className="numeric"
          onChange={(e) => {
            if (e.target.value === "custom") {
              focusRequested.current = true;
              setIsCustom(true);
              return;
            }

            setIsCustom(false);
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
          {recentSizes
            .filter(
              (size) =>
                !sizes.some(([w, h]) => w === size.width && h === size.height),
            )
            .map((size) => (
              <option
                key={`${size.width}x${size.height}`}
                value={`${size.width}x${size.height}`}
              >
                Recent: {size.width}×{size.height}
              </option>
            ))}
          <option value="custom">Custom</option>
        </select>
      </label>

      {value === "custom" && (
        <div
          className={styles.custom}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              commitCustomSize();
          }}
          onKeyDown={handleKeyDown}
        >
          <label htmlFor="custom-width" className="visuallyHidden">
            Custom width
          </label>
          <input
            id="custom-width"
            ref={widthInput}
            className="numeric"
            type="number"
            min="1"
            max={MAX_DIMENSION}
            step="1"
            value={draft.width}
            onChange={(e) => setDraft({ ...draft, width: e.target.value })}
            aria-invalid={invalid}
            aria-describedby={invalid ? "size-error" : undefined}
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
            aria-invalid={invalid}
            aria-describedby={invalid ? "size-error" : undefined}
            disabled={disabled === true}
          />
          <span>px</span>
        </div>
      )}
      {invalid && (
        <span id="size-error" className="visuallyHidden">
          {feedback.message} Applied size is {selectedWidth}×{selectedHeight}px.
          Escape restores it.
        </span>
      )}
    </div>
  );
}
