export function unsupportedFeatures(environment = globalThis) {
  const missing = [];
  if (typeof environment.Worker !== "function") missing.push("Web Workers");
  if (typeof environment.WebAssembly?.instantiate !== "function")
    missing.push("WebAssembly");
  if (
    typeof environment.OffscreenCanvas !== "function" ||
    typeof environment.OffscreenCanvas.prototype.convertToBlob !== "function"
  )
    missing.push("OffscreenCanvas image encoding");
  if (
    typeof environment.crypto?.randomUUID !== "function" ||
    typeof environment.crypto?.subtle?.digest !== "function"
  )
    missing.push("secure-context cryptography");
  if (typeof environment.AbortSignal?.prototype.throwIfAborted !== "function")
    missing.push("abortable processing");
  if (typeof environment.HTMLDialogElement?.prototype.showModal !== "function")
    missing.push("modal dialogs");
  return missing;
}
