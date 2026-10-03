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
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (hasBytes(bytes, PNG_SIGNATURE)) return "png";
  if (
    hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  return null;
}

async function readRange(file, start, end) {
  if (typeof file?.slice !== "function")
    throw new Error("the file cannot be read in bounded chunks");
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

/** Identify supported image data from its bytes; the declared MIME type is advisory. */
export async function inspectImageFile(file) {
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
    format = identifyFormat(await readRange(file, 0, 12));
  } catch (error) {
    throw new Error(`Could not read "${filename}": ${error.message}`);
  }
  if (!format) {
    const typeHint = file.type ? ` (declared as ${file.type})` : "";
    throw new Error(
      `"${filename}"${typeHint} is not a supported JPEG, PNG or WebP image.`,
    );
  }
  return { file, sourceFormat: format };
}

async function sameContent(left, right) {
  if (left.size !== right.size) return false;
  for (let start = 0; start < left.size; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, left.size);
    const [leftBytes, rightBytes] = await Promise.all([
      readRange(left, start, end),
      readRange(right, start, end),
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
 */
export async function partitionImageFiles(
  files,
  existingSources = [],
  options = {},
) {
  const accepted = [];
  const duplicates = [];
  const duplicateFiles = [];
  const errors = [];
  const previousFiles = (existingSources ?? []).map(sourceFile).filter(Boolean);
  const allowDuplicates = options.allowDuplicates === true;

  for (const file of files ?? []) {
    const filename = filenameOf(file);
    try {
      const inspected = await inspectImageFile(file);
      if (!allowDuplicates) {
        let duplicate = false;
        for (const previous of previousFiles) {
          if (
            Number.isSafeInteger(previous?.size) &&
            previous.size === file.size &&
            (await sameContent(file, previous))
          ) {
            duplicate = true;
            break;
          }
        }
        if (duplicate) {
          duplicates.push(filename);
          duplicateFiles.push(file);
          continue;
        }
      }
      accepted.push(inspected);
      previousFiles.push(file);
    } catch (error) {
      errors.push({ filename, message: error.message });
    }
  }

  return { accepted, duplicates, duplicateFiles, errors };
}
