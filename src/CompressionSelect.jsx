const pngColorOptions = [
  [0, "Lossless"],
  [256, "256 colors"],
  [128, "128 colors"],
  [64, "64 colors"],
  [32, "32 colors"],
];

export default function CompressionSelect({
  format,
  onChange,
  value,
  pngColors,
  onPngColorsChange,
  disabled,
}) {
  // select list of values from 0.3 to 1.0 at 0.1 intervals
  // round level to 0.1 to avoid floating point errors, and always show 0.1 value
  const levels = Array.from({ length: 8 }, (_, index) => 0.3 + index * 0.1).map(
    (level) => Math.round(level * 10) / 10
  );

  if (format === "png") {
    return (
      <label htmlFor="png-colors">
        PNG Optimisation
        <select
          id="png-colors"
          onChange={(e) => onPngColorsChange(Number(e.target.value))}
          value={pngColors}
          disabled={disabled === true}
        >
          {pngColorOptions.map(([colors, label]) => (
            <option key={colors} value={colors}>
              {label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label htmlFor="compression">
      {format === "webp" ? "WebP Quality" : "JPEG Quality"}
      <select
        id="compression"
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        value={value}
        disabled={disabled === true}
      >
        {levels.map((level, index) => {
          level = Math.round(level * 10) / 10;
          return (
            <option key={index} value={level}>
              {
                // always show 1 as 1.0
                level === 1 ? `${level}.0` : level
              }
            </option>
          );
        })}
      </select>
    </label>
  );
}
