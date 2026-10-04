const outputFormats = [
  ["source", "Source"],
  ["jpeg", "JPEG"],
  ["png", "PNG"],
  ["webp", "WebP"],
  ["avif", "AVIF"],
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
          ? "JPEG uses the selected background colour. PNG, WebP and AVIF preserve transparency."
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
