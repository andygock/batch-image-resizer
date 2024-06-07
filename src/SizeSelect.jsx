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
  return (
    <label htmlFor="size">
      Bounding Size
      <select
        id="size"
        onChange={(e) => {
          onChange(e.target.value);
        }}
        value={`${selectedWidth}x${selectedHeight}`}
        disabled={disabled === true}
      >
        {sizes.map(([optionWidth, optionHeight], index) => {
          const isSelected =
            `${optionWidth}x${optionHeight}` ===
            `${selectedWidth}x${selectedHeight}`;
          return (
            <option key={index} value={`${optionWidth}x${optionHeight}`}>
              {optionWidth}x{optionHeight}
            </option>
          );
        })}
      </select>
    </label>
  );
}
