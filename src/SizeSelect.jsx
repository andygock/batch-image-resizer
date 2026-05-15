import { useState } from "react";

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
  const selectedValue = `${selectedWidth}x${selectedHeight}`;
  const isPreset = sizes.some(
    ([optionWidth, optionHeight]) =>
      `${optionWidth}x${optionHeight}` === selectedValue,
  );
  const value = isCustom || !isPreset ? "custom" : selectedValue;

  const updateCustomSize = (dimension, nextValue) => {
    const parsedValue = Number(nextValue);

    if (!Number.isFinite(parsedValue) || parsedValue < 1) {
      return;
    }

    onChange({
      width: dimension === "width" ? parsedValue : selectedWidth,
      height: dimension === "height" ? parsedValue : selectedHeight,
    });
  };

  return (
    <div className="size-control">
      <label htmlFor="size">
        Max size
        <select
          id="size"
          onChange={(e) => {
            if (e.target.value === "custom") {
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
          <option value="custom">Custom</option>
        </select>
      </label>

      {value === "custom" && (
        <div className="custom-size">
          <label htmlFor="custom-width" className="visually-hidden">
            Custom width
          </label>
          <input
            id="custom-width"
            type="number"
            min="1"
            value={selectedWidth}
            onChange={(e) => updateCustomSize("width", e.target.value)}
            disabled={disabled === true}
          />
          <span aria-hidden="true">x</span>
          <label htmlFor="custom-height" className="visually-hidden">
            Custom height
          </label>
          <input
            id="custom-height"
            type="number"
            min="1"
            value={selectedHeight}
            onChange={(e) => updateCustomSize("height", e.target.value)}
            disabled={disabled === true}
          />
        </div>
      )}
    </div>
  );
}
