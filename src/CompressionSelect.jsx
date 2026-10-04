import { useEffect, useState } from "react";

const pngColorOptions = [
  [0, "Lossless"],
  [256, "256 colours"],
  [128, "128 colours"],
  [64, "64 colours"],
  [32, "32 colours"],
];

function QualityControl({
  format,
  value,
  onChange,
  idPrefix = "",
  compact = false,
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100)));
  useEffect(() => setDraft(String(Math.round(value * 100))), [value]);
  const percent = Number(draft);
  const valid =
    draft !== "" &&
    Number.isInteger(percent) &&
    percent >= 30 &&
    percent <= 100;
  const commit = () => {
    if (valid && percent / 100 !== value) onChange(percent / 100);
  };
  const cancel = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(String(Math.round(value * 100)));
    }
  };
  const title = `${format === "jpeg" ? "JPEG" : "WebP"} quality`;
  return (
    <div className="qualityControl">
      <label htmlFor={`${idPrefix}${format}-quality-number`} title={title}>
        {compact ? `${format === "jpeg" ? "JPG" : "WebP"} Q` : title}
      </label>
      {!compact && (
        <input
          type="range"
          min="30"
          max="100"
          step="1"
          value={valid ? percent : Math.round(value * 100)}
          aria-label={title}
          onInput={(event) => setDraft(event.target.value)}
          onPointerUp={commit}
          onBlur={commit}
          onKeyDown={cancel}
          onKeyUp={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(event.key)
            )
              commit();
          }}
        />
      )}
      <input
        id={`${idPrefix}${format}-quality-number`}
        className="numeric qualityNumber"
        type="number"
        min="30"
        max="100"
        step="1"
        value={draft}
        aria-label={title}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        aria-invalid={!valid}
        onKeyDown={(event) => {
          cancel(event);
          if (event.key === "Enter") commit();
        }}
      />
      <span>%</span>
      {!valid && (
        <span role="status">
          Enter 30–100%. Applied: {Math.round(value * 100)}%.
        </span>
      )}
    </div>
  );
}

export default function CompressionSelect({
  format,
  qualityByFormat,
  onQualityChange,
  pngColors,
  onPngColorsChange,
  sourceFormats = [],
  idPrefix = "",
  compact = false,
}) {
  const formats = format === "source" ? [...new Set(sourceFormats)] : [format];
  return (
    <>
      {["jpeg", "webp"]
        .filter((type) => formats.includes(type))
        .map((type) => (
          <QualityControl
            key={type}
            idPrefix={idPrefix}
            compact={compact}
            format={type}
            value={qualityByFormat[type]}
            onChange={(quality) => onQualityChange(type, quality)}
          />
        ))}
      {formats.includes("png") && (
        <label htmlFor={`${idPrefix}png-colors`}>
          {compact ? "Palette" : "PNG colours"}
          <select
            id={`${idPrefix}png-colors`}
            onChange={(event) => onPngColorsChange(Number(event.target.value))}
            value={pngColors}
          >
            {pngColorOptions.map(([colours, label]) => (
              <option key={colours} value={colours}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
