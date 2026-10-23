import { sanitiseAdvanced } from "./advancedSettings.js";
import { decodeImage } from "./decodeImage.js";
import { fitDimensions, outputFormats } from "./imageUtils.js";
import { drawProcessed } from "./processImage.js";
import { sanitiseProcessing } from "./processingSettings.js";
import { createWorkerTask } from "./workerTask.js";

const pngTask = createWorkerTask(
  () =>
    new Worker(new URL("./png.worker.js", import.meta.url), { type: "module" }),
  {
    label: "PNG",
    reuse: true,
    validate: (data) => {
      if (!data.fallback && !data.buffer?.byteLength)
        throw new Error("PNG encoder returned no image.");
    },
  },
);
const encoderTask = createWorkerTask(
  () =>
    new Worker(new URL("./encoder.worker.js", import.meta.url), {
      type: "module",
    }),
  {
    label: "Advanced encoder",
    reuse: true,
    validate: (data) => {
      if (!data.buffer?.byteLength)
        throw new Error("Advanced encoder returned no image.");
    },
  },
);

function canvasPixels(canvas) {
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
    .data;
}

async function encodePng(canvas, colours, signal, advanced) {
  signal.throwIfAborted();
  const pixels = canvasPixels(canvas);
  const data = await pngTask(
    {
      buffer: pixels.buffer,
      width: canvas.width,
      height: canvas.height,
      colours,
      advanced,
    },
    signal,
    [pixels.buffer],
  );
  if (data.fallback) {
    // Native lossless PNG remains client-side and avoids UPNG truncation.
    const blob = await canvas.convertToBlob({ type: "image/png" });
    signal.throwIfAborted();
    return {
      blob,
      appliedColours: 0,
      encodingWarning: colours
        ? `The ${colours}-colour optimisation could not be completed. Saved a lossless PNG instead; palette reduction was skipped.`
        : "",
    };
  }
  return {
    blob: new Blob([data.buffer], { type: "image/png" }),
    appliedColours: colours,
  };
}

async function encodeWithWorker(canvas, settings, signal) {
  signal.throwIfAborted();
  const pixels = canvasPixels(canvas);
  const data = await encoderTask(
    {
      buffer: pixels.buffer,
      width: canvas.width,
      height: canvas.height,
      settings,
    },
    signal,
    [pixels.buffer],
  );
  return {
    blob: new Blob([data.buffer], {
      type: outputFormats[settings.format].mimeType,
    }),
  };
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
      ctx.fillStyle = sanitiseAdvanced(settings.advanced).jpeg.background;
      ctx.fillRect(0, 0, size.width, size.height);
    }
    const processing = sanitiseProcessing(settings.processing);
    if (
      processing.method === "lanczos3" ||
      processing.method === "mitchell" ||
      (processing.sharpen && processing.amount > 0)
    ) {
      await drawProcessed(ctx, bitmap, size, processing, signal);
    } else {
      ctx.imageSmoothingEnabled = processing.method !== "nearest";
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap.image, 0, 0, size.width, size.height);
    }
    stage = "encode";
    const encodingStarted = performance.now();
    const { mimeType, extension } = outputFormats[settings.format];
    const encoded =
      settings.format === "png"
        ? await encodePng(canvas, settings.colours, signal, settings.advanced)
        : settings.format === "avif" ||
            sanitiseAdvanced(settings.advanced)[settings.format]?.encoder ===
              "advanced"
          ? await encodeWithWorker(canvas, settings, signal)
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
      encodingWarning:
        encodingWarning ||
        (settings.format === "webp" &&
        settings.advanced?.webp?.encoder === "advanced" &&
        settings.advanced.webp.mode === "lossy" &&
        settings.advanced.webp.targetSizeKB > 0 &&
        blob.size > settings.advanced.webp.targetSizeKB * 1000
          ? "The WebP output exceeds the requested target size. Try smaller dimensions or a larger target."
          : ""),
      appliedColours,
      encodingTimeMs: performance.now() - encodingStarted,
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
