export default function CompressionSelect({ onChange, value, disabled }) {
  // select list of values from 0.3 to 1.0 at 0.1 intervals
  // round level to 0.1 to avoid floating point errors, and always show 0.1 value
  const levels = Array.from({ length: 8 }, (_, index) => 0.3 + index * 0.1).map(
    (level) => Math.round(level * 10) / 10
  );

  return (
    <label htmlFor="compression">
      Compression
      <select
        id="compression"
        onChange={(e) => {
          onChange(e.target.value);
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
