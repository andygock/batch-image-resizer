import { decodeAvifImage } from "./decodeAvifImage.js";
import {
  ImageLimitError,
  preflightImage,
  validateSourceDimensions,
} from "./imageLimits.js";

function loadImage(file, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const image = new Image();
    const url = URL.createObjectURL(file);
    let settled = false;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      image.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
      if (error) {
        close();
        reject(error);
      } else {
        resolve({
          image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          close,
        });
      }
    };
    const abort = () => finish(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      try {
        validateSourceDimensions(image.naturalWidth, image.naturalHeight);
        finish();
      } catch (error) {
        finish(error);
      }
    };
    image.onerror = () => finish(new Error("The image could not be loaded."));
    try {
      image.src = url;
    } catch (error) {
      finish(error);
    }
  });
}

export async function decodeImage(file, signal) {
  await preflightImage(file, signal);
  let failure;
  // A successful manual retry should also succeed without user intervention.
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    try {
      const image = await createImageBitmap(file);
      if (signal.aborted) {
        image.close();
        throw signal.reason;
      }
      try {
        validateSourceDimensions(image.width, image.height);
      } catch (error) {
        image.close();
        throw error;
      }
      return {
        image,
        width: image.width,
        height: image.height,
        close: () => image.close(),
      };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ImageLimitError) throw error;
      failure = error;
    }
  }
  // Draw the image element directly; converting it back to a bitmap would reuse
  // the API that failed and lose the benefit of this alternative loading path.
  try {
    return await loadImage(file, signal);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof ImageLimitError) throw error;
    if (file.type === "image/avif") return decodeAvifImage(file, signal);
    throw new Error(
      `Automatic decoding recovery failed: ${failure.message} ${error.message}`,
      { cause: error },
    );
  }
}
