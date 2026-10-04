import { buildPaletteSync, distance, image, utils } from "image-q";

export function ditherPalette(buffer, width, height, colours, strength) {
  const points = utils.PointContainer.fromUint8Array(
    new Uint8Array(buffer),
    width,
    height,
  );
  const palette = buildPaletteSync([points], {
    colors: colours,
    paletteQuantization: "wuquant",
    colorDistanceFormula: "euclidean-bt709",
  });
  const quantizer = new image.ErrorDiffusionRiemersma(
    new distance.EuclideanBT709(),
    16,
    strength / 100,
  );
  return quantizer.quantizeSync(points, palette).toUint8Array().buffer;
}
