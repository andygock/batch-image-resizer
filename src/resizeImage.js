import { decodeImage } from "./decodeImage.js";
import { fitDimensions, outputFormats } from "./imageUtils.js";

function encodePng(canvas, colours, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("./png.worker.js", import.meta.url), {
      type: "module",
    });
    const finish = (error, blob, metadata = { appliedColours: colours }) => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve({ blob, ...metadata });
    };
    const abort = () => finish(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.fallback) {
        // Native lossless PNG remains client-side and avoids UPNG truncation.
        canvas.convertToBlob({ type: "image/png" }).then(
          (blob) =>
            finish(null, blob, {
              appliedColours: 0,
              encodingWarning: colours
                ? `The ${colours}-colour optimisation could not be completed. Saved a lossless PNG instead; palette reduction was skipped.`
                : "",
            }),
          (error) => finish(error),
        );
        return;
      }
      finish(
        data.error ? new Error(data.error) : null,
        data.buffer
          ? new Blob([data.buffer], { type: "image/png" })
          : undefined,
      );
    };
    worker.onerror = () => finish(new Error("PNG worker failed."));
    worker.onmessageerror = () =>
      finish(new Error("Invalid PNG worker response."));
    try {
      const { data } = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height);
      worker.postMessage(
        {
          buffer: data.buffer,
          width: canvas.width,
          height: canvas.height,
          colours,
        },
        [data.buffer],
      );
    } catch (error) {
      finish(error);
    }
  });
}

export async function resizeImage({ id, file }, settings, signal) {
  let bitmap;
  let canvas;
  let stage = "decode";
  try {
    signal.throwIfAborted();
    bitmap = await decodeImage(file, signal);
    signal.throwIfAborted();
    stage = "resize";
    const size = fitDimensions(
      bitmap.width,
      bitmap.height,
      settings.bounds,
      settings.disableUpscale,
    );
    canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable.");
    // JPEG cannot preserve transparency; make the flattening colour explicit.
    if (settings.format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.drawImage(bitmap.image, 0, 0, size.width, size.height);
    stage = "encode";
    const { mimeType, extension } = outputFormats[settings.format];
    const encoded =
      settings.format === "png"
        ? await encodePng(canvas, settings.colours, signal)
        : {
            blob: await canvas.convertToBlob({
              type: mimeType,
              quality: settings.quality,
            }),
          };
    const { blob, encodingWarning, appliedColours } = encoded;
    signal.throwIfAborted();
    if (!blob?.size || blob.type !== mimeType)
      throw new Error(
        `This browser could not encode ${settings.format.toUpperCase()}.`,
      );
    return {
      id,
      filename: file.name,
      blob,
      filesizeBefore: file.size,
      filesizeAfter: blob.size,
      widthBefore: bitmap.width,
      heightBefore: bitmap.height,
      widthAfter: size.width,
      heightAfter: size.height,
      outputExtension: extension,
      encodingWarning,
      appliedColours,
    };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw new Error(`Could not ${stage} "${file.name}": ${error.message}`);
  } finally {
    // Native image/canvas allocations should not wait for garbage collection.
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
