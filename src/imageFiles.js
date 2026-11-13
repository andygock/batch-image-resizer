import {
  ImageLimitError,
  MAX_BATCH_BYTES,
  preflightImage,
  validateFileSize,
} from "./imageLimits.js";

import { inputMimeTypes, isSvgPrefix } from "./inputFormats.js";

const digests = new WeakMap();

async function chunkDigest(bytes, signal) {
  signal?.throwIfAborted();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  signal?.throwIfAborted();
  return digest;
}

async function finishDigest(parts, signal) {
  const bytes = new Uint8Array(parts.length * 32);
  parts.forEach((part, index) => {
    bytes.set(part, index * 32);
  });
  return Array.from(await chunkDigest(bytes, signal), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function digestFile(file, signal) {
  if (digests.has(file)) return digests.get(file);
  const parts = [];
  for (let start = 0; start < file.size; start += CHUNK_SIZE)
    parts.push(
      await chunkDigest(
        await readRange(
          file,
          start,
          Math.min(start + CHUNK_SIZE, file.size),
          signal,
        ),
        signal,
      ),
    );
  const digest = await finishDigest(parts, signal);
  digests.set(file, digest);
  return digest;
}

const CHUNK_SIZE = 64 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function filenameOf(file) {
  return typeof file?.name === "string" && file.name
    ? file.name
    : "(unnamed file)";
}

function hasBytes(bytes, signature, offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function identifyFormat(bytes) {
  if (hasBytes(bytes, [0x66, 0x74, 0x79, 0x70], 4) && bytes.length >= 16) {
    const size = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(0);
    if (size >= 16 && size <= bytes.length && size % 4 === 0) {
      let heic = false;
      for (let offset = 8; offset < size; offset += 4) {
        if (offset !== 12 && hasBytes(bytes, [0x61, 0x76, 0x69, 0x66], offset))
          return "avif";
        if (
          offset !== 12 &&
          ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(
            new TextDecoder().decode(bytes.subarray(offset, offset + 4)),
          )
        )
          heic = true;
      }
      if (heic) return "heic";
    }
  }
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (hasBytes(bytes, PNG_SIGNATURE)) return "png";
  if (hasBytes(bytes, [0x42, 0x4d])) return "bmp";
  if (
    hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  if (
    hasBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    hasBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  )
    return "gif";
  if (
    hasBytes(bytes, [0x49, 0x49, 0x2a, 0]) ||
    hasBytes(bytes, [0x4d, 0x4d, 0, 0x2a])
  )
    return "tiff";
  if (isSvgPrefix(bytes)) return "svg";
  return null;
}

async function readRange(file, start, end, signal) {
  signal?.throwIfAborted();
  if (typeof file?.slice !== "function")
    throw new Error("the file cannot be read in bounded chunks");
  const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
  signal?.throwIfAborted();
  return bytes;
}

/** Identify supported image data from its bytes; the declared MIME type is advisory. */
export async function inspectImageFile(file, options = {}) {
  const { signal } = options;
  signal?.throwIfAborted();
  const filename = filenameOf(file);
  if (
    !file ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    typeof file.slice !== "function"
  ) {
    throw new Error(
      `"${filename}" is empty or cannot be read as an image file.`,
    );
  }

  let format;
  try {
    await preflightImage(file, signal);
    format = identifyFormat(
      await readRange(file, 0, Math.min(file.size, CHUNK_SIZE), signal),
    );
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(`Could not read "${filename}": ${error.message}`);
  }
  if (!format) {
    const typeHint = file.type ? ` (declared as ${file.type})` : "";
    throw new Error(
      `"${filename}"${typeHint} is not a supported JPEG, PNG, WebP, AVIF, BMP, GIF, HEIC/HEIF, TIFF or SVG image.`,
    );
  }
  try {
    // Copy bytes, not Blob references: temporary files can change on disk after import.
    const chunks = [];
    const hashes = [];
    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const bytes = await readRange(file, start, end, signal);
      if (bytes.length !== end - start)
        throw new Error("the file changed while it was being imported");
      chunks.push(bytes);
      hashes.push(await chunkDigest(bytes, signal));
    }
    const copiedFormat = identifyFormat(chunks[0]);
    if (copiedFormat !== format)
      throw new Error("the file changed while it was being imported");
    const copy = new File(chunks, filename, {
      type: ["avif", "bmp", "gif", "heic", "tiff", "svg"].includes(format)
        ? inputMimeTypes[format]
        : file.type,
      lastModified: file.lastModified,
    });
    digests.set(copy, await finishDigest(hashes, signal));
    await preflightImage(copy, signal);
    return { file: copy, sourceFormat: copiedFormat };
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(`Could not read "${filename}": ${error.message}`);
  }
}

async function sameContent(left, right, signal) {
  if (left.size !== right.size) return false;
  for (let start = 0; start < left.size; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, left.size);
    const [leftBytes, rightBytes] = await Promise.all([
      readRange(left, start, end, signal),
      readRange(right, start, end, signal),
    ]);
    if (
      leftBytes.length !== rightBytes.length ||
      leftBytes.some((byte, index) => byte !== rightBytes[index])
    ) {
      return false;
    }
  }
  return true;
}

function sourceFile(source) {
  return source && typeof source === "object" && "file" in source
    ? source.file
    : source;
}

/**
 * Validate files and optionally remove exact-content duplicates while preserving input order.
 * Existing sources may be File/Blob values or objects containing a `file` property.
 * With onAccepted, callers own each published source; accepted is empty on return.
 * getExistingSources must include those publications and reflect later removals.
 */
export async function partitionImageFiles(
  files,
  existingSources = [],
  options = {},
) {
  const { signal } = options;
  if (options.onAccepted && !options.getExistingSources)
    throw new Error("Incremental imports require current batch membership.");
  signal?.throwIfAborted();
  const accepted = [];
  const duplicates = [];
  const duplicateFiles = [];
  const errors = [];
  const allowDuplicates = options.allowDuplicates === true;
  const currentFiles = () => [
    ...new Set(
      [
        ...(options.getExistingSources?.() ?? existingSources ?? []).map(
          sourceFile,
        ),
        ...accepted.map(sourceFile),
      ].filter(Boolean),
    ),
  ];
  const retainedBytes = (extra) =>
    [
      ...new Set([
        ...currentFiles(),
        ...duplicateFiles,
        ...(options.getRetainedFiles?.() ?? []),
        ...(extra ? [extra] : []),
      ]),
    ].reduce((sum, file) => sum + file.size, 0);
  const index = new Map();
  const indexed = new Set();
  const addToIndex = async (file) => {
    const key = `${file.size}:${await digestFile(file, signal)}`;
    const bucket = index.get(key) ?? [];
    bucket.push(file);
    index.set(key, bucket);
  };
  const refreshIndex = async () => {
    if (allowDuplicates) return;
    const files = new Set(currentFiles());
    for (const [key, bucket] of index) {
      const live = bucket.filter((file) => files.has(file));
      if (live.length) index.set(key, live);
      else index.delete(key);
    }
    for (const file of indexed) if (!files.has(file)) indexed.delete(file);
    for (const file of files)
      if (!indexed.has(file)) {
        await addToIndex(file);
        indexed.add(file);
      }
  };

  const incoming = Array.from(files ?? []);
  let completed = 0;
  for (const file of incoming) {
    signal?.throwIfAborted();
    const filename = filenameOf(file);
    options.onProgress?.({ completed, total: incoming.length, filename });
    try {
      validateFileSize(file);
      const verified = allowDuplicates
        ? options.getVerifiedSource?.(file)
        : null;
      if (
        retainedBytes(verified?.file) + (verified ? 0 : (file?.size ?? 0)) >
        MAX_BATCH_BYTES
      )
        throw new ImageLimitError(
          "The batch, retained duplicates and Undo files must fit within 256 MiB. Clear the batch or dismiss Undo before adding more.",
        );
      const inspected = verified ?? (await inspectImageFile(file, { signal }));
      await refreshIndex();
      signal?.throwIfAborted();
      if (retainedBytes(inspected.file) > MAX_BATCH_BYTES)
        throw new ImageLimitError(
          "The batch, retained duplicates and Undo files must fit within 256 MiB.",
        );
      if (!allowDuplicates) {
        let duplicate = false;
        const key = `${inspected.file.size}:${await digestFile(inspected.file, signal)}`;
        for (const previous of index.get(key) ?? []) {
          if (
            Number.isSafeInteger(previous?.size) &&
            previous.size === inspected.file.size &&
            (await sameContent(inspected.file, previous, signal))
          ) {
            duplicate = true;
            break;
          }
        }
        if (duplicate) {
          duplicates.push(filename);
          duplicateFiles.push(inspected.file);
          options.onDuplicate?.(inspected.file, inspected);
          continue;
        }
      }
      if (options.onAccepted) await options.onAccepted(inspected);
      else accepted.push(inspected);
    } catch (error) {
      signal?.throwIfAborted();
      errors.push({
        filename,
        message:
          error instanceof ImageLimitError
            ? `Could not import "${filename}": ${error.message}`
            : error.message,
      });
      options.onError?.(errors[errors.length - 1]);
    } finally {
      completed++;
      options.onProgress?.({ completed, total: incoming.length, filename });
    }
  }

  return { accepted, duplicates, duplicateFiles, errors };
}
