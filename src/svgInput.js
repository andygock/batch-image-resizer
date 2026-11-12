import { validateSourceDimensions } from "./imageLimits.js";
import { fitDimensions } from "./imageUtils.js";

const units = {
  "": 1,
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  pt: 96 / 72,
  pc: 16,
};

function length(value) {
  if (value == null || value === "" || value.endsWith("%")) return null;
  const match =
    /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*(px|in|cm|mm|q|pt|pc)?\s*$/i.exec(value);
  if (!match)
    throw new Error("SVG dimensions must use positive lengths or a viewBox.");
  return Number(match[1]) * units[(match[2] ?? "").toLowerCase()];
}

export async function prepareSvg(file, signal, options) {
  const text = await file.text();
  signal.throwIfAborted();
  // Entity declarations are unnecessary for image inputs and can expand during parsing.
  if (/<!ENTITY\b/i.test(text))
    throw new Error("SVG entity declarations are not supported.");
  const document = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = document.documentElement;
  if (
    document.querySelector("parsererror") ||
    root?.localName !== "svg" ||
    root.namespaceURI !== "http://www.w3.org/2000/svg"
  )
    throw new Error("The SVG document is invalid.");
  const viewBox = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox &&
    (viewBox.length !== 4 ||
      !viewBox.every(Number.isFinite) ||
      viewBox[2] <= 0 ||
      viewBox[3] <= 0)
  )
    throw new Error("The SVG viewBox is invalid.");
  let width = length(root.getAttribute("width"));
  let height = length(root.getAttribute("height"));
  if (viewBox) {
    width ??= height == null ? viewBox[2] : (height * viewBox[2]) / viewBox[3];
    height ??= (width * viewBox[3]) / viewBox[2];
  }
  width = Math.ceil(width ?? 300);
  height = Math.ceil(height ?? 150);
  validateSourceDimensions(width, height);
  const target = options?.bounds
    ? fitDimensions(width, height, options.bounds, options.disableUpscale)
    : { width, height };
  // Explicit sizes make viewBox-only SVGs portable and render vectors at output resolution.
  if (!viewBox) root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  root.setAttribute("width", String(target.width));
  root.setAttribute("height", String(target.height));
  const serialised = new XMLSerializer().serializeToString(root);
  return {
    file: new Blob([serialised], { type: "image/svg+xml" }),
    width,
    height,
  };
}
