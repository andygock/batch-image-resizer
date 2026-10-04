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
    image.onload = () =>
      finish(
        image.naturalWidth && image.naturalHeight
          ? null
          : new Error("The loaded image has no usable dimensions."),
      );
    image.onerror = () => finish(new Error("The image could not be loaded."));
    try {
      image.src = url;
    } catch (error) {
      finish(error);
    }
  });
}

export async function decodeImage(file, signal) {
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
      return {
        image,
        width: image.width,
        height: image.height,
        close: () => image.close(),
      };
    } catch (error) {
      signal.throwIfAborted();
      failure = error;
    }
  }
  // Draw the image element directly; converting it back to a bitmap would reuse
  // the API that failed and lose the benefit of this alternative loading path.
  try {
    return await loadImage(file, signal);
  } catch (error) {
    signal.throwIfAborted();
    throw new Error(
      `Automatic decoding recovery failed: ${failure.message} ${error.message}`,
      { cause: error },
    );
  }
}
