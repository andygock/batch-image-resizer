const outputFormats = [
  ["source", "Keep source format"],
  ["jpeg", "JPEG"],
  ["png", "PNG"],
  ["webp", "WebP"],
];

export default function OutputFormatSelect({
  onChange,
  value,
  disabled,
  id = "output-format",
}) {
  return (
    <label
      htmlFor={id}
      title={
        value === "jpeg"
          ? "JPEG makes transparent areas white. PNG and WebP preserve transparency."
          : "Keep source format to resize without converting image types."
      }
    >
      Format
      <select
        id={id}
        onChange={(e) => onChange(e.target.value)}
        value={value}
        disabled={disabled === true}
      >
        {outputFormats.map(([format, label]) => (
          <option key={format} value={format}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
