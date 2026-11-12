// Uncompressed RGB TIFF with inline metadata and one strip, generated for tests.
export function tiffFixture({
  width = 2,
  height = 1,
  orientation = 1,
  little = true,
} = {}) {
  const entries = [
    [256, 4, 1, width],
    [257, 4, 1, height],
    [258, 3, 3, 134],
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, 140],
    [274, 3, 1, orientation],
    [277, 3, 1, 3],
    [278, 4, 1, height],
    [279, 4, 1, 6],
  ];
  const bytes = new Uint8Array(146);
  bytes.set(little ? [73, 73, 42, 0] : [77, 77, 0, 42]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 8, little);
  view.setUint16(8, entries.length, little);
  entries.forEach(([tag, type, count, value], index) => {
    const at = 10 + index * 12;
    view.setUint16(at, tag, little);
    view.setUint16(at + 2, type, little);
    view.setUint32(at + 4, count, little);
    if (type === 3 && count === 1) view.setUint16(at + 8, value, little);
    else view.setUint32(at + 8, value, little);
  });
  for (let at = 134; at < 140; at += 2) view.setUint16(at, 8, little);
  bytes.set([255, 0, 0, 0, 255, 0], 140);
  return bytes;
}

export function multipageTiffFixture() {
  const first = tiffFixture();
  const second = tiffFixture();
  const offset = first.length;
  const view = new DataView(second.buffer);
  // Rebase the second IFD's out-of-line BitsPerSample and strip pointers.
  view.setUint32(10 + 2 * 12 + 8, offset + 134, true);
  view.setUint32(10 + 5 * 12 + 8, offset + 140, true);
  second.set([0, 0, 255, 255, 255, 0], 140);
  new DataView(first.buffer).setUint32(130, offset + 8, true);
  const bytes = new Uint8Array(first.length + second.length);
  bytes.set(first);
  bytes.set(second, offset);
  return bytes;
}
