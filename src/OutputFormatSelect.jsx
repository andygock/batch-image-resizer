const outputFormats = [
  ["jpeg", "JPEG"],
  ["png", "PNG"],
  ["webp", "WebP"],
];

export default function OutputFormatSelect({ onChange, value, disabled }) {
  return (
    <label htmlFor="output-format">
      Format
      <select
        id="output-format"
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
