import { settingsKey } from "./batchProcessor.js";

export function downloadRequestKey(output) {
  return JSON.stringify([
    output.id,
    settingsKey(output.settings),
    output.downloadFilename,
  ]);
}

export function retainDownloadRequests(requests, ids) {
  return requests.filter((request) => {
    try {
      return ids.has(JSON.parse(request)[0]);
    } catch {
      return false;
    }
  });
}

export function archiveFilename(outputs, date = new Date()) {
  const sizes = new Set(
    outputs.map(
      ({ settings }) => `${settings.bounds.width}x${settings.bounds.height}`,
    ),
  );
  const formats = new Set(
    outputs.map(({ outputExtension }) => outputExtension),
  );
  const size = sizes.size === 1 ? [...sizes][0] : "mixed-sizes";
  const format = formats.size === 1 ? [...formats][0] : "mixed-formats";
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `images-${size}-${format}-${outputs.length}-${stamp}.zip`;
}
