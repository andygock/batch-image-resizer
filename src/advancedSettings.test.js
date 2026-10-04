import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ADVANCED,
  jpegOptions,
  sanitiseAdvanced,
  webpOptions,
} from "./advancedSettings.js";
import { createBatchProcessor, settingsKey } from "./batchProcessor.js";
import { sanitisePreferences } from "./preferences.js";

test("old or malformed preferences get safe advanced defaults", () => {
  assert.deepEqual(sanitisePreferences({}).advanced, DEFAULT_ADVANCED);
  const settings = sanitiseAdvanced({
    webp: { mode: "lossless", method: 99, exact: "true", targetSizeKB: -1 },
    jpeg: { background: "url(bad)", trellisLoops: 2.5 },
    png: { dither: 101 },
  });
  assert.equal(settings.webp.mode, "lossless");
  assert.equal(settings.webp.method, 4);
  assert.equal(settings.webp.exact, false);
  assert.equal(settings.webp.targetSizeKB, 0);
  assert.equal(settings.jpeg.background, "#ffffff");
  assert.equal(settings.jpeg.trellisLoops, 1);
  assert.equal(settings.png.dither, 0);
  for (const pngColors of [2, 4, 8, 16])
    assert.equal(sanitisePreferences({ pngColors }).pngColors, pngColors);
});

test("lossless and target-size modes have distinct codec options", () => {
  const settings = {
    quality: 0.4,
    advanced: sanitiseAdvanced({
      webp: {
        mode: "lossless",
        losslessQuality: 85,
        targetSizeKB: 20,
        alphaQuality: 30,
        exact: true,
      },
    }),
  };
  assert.equal(webpOptions(settings).lossless, 1);
  assert.equal(webpOptions(settings).quality, 85);
  assert.equal(webpOptions(settings).near_lossless, 100);
  assert.equal(webpOptions(settings).alpha_quality, 100);
  assert.equal(webpOptions(settings).target_size, 0);
  assert.equal(webpOptions(settings).exact, 1);
  settings.advanced.webp.mode = "near-lossless";
  settings.advanced.webp.nearLossless = 50;
  assert.equal(webpOptions(settings).near_lossless, 50);
  settings.advanced.webp.mode = "lossy";
  assert.equal(webpOptions(settings).target_size, 20000);
  assert.equal(webpOptions(settings).pass, 6);
  assert.equal(webpOptions(settings).quality, 75);
  assert.equal(webpOptions(settings).exact, 0);
});

test("MozJPEG uses valid sampling factors and independent chroma quality", () => {
  const settings = {
    quality: 0.8,
    advanced: sanitiseAdvanced({
      jpeg: { subsampling: "444", separateChroma: true, chromaQuality: 65 },
    }),
  };
  assert.equal(jpegOptions(settings).chroma_subsample, 1);
  assert.equal(jpegOptions(settings).auto_subsample, false);
  assert.equal(jpegOptions(settings).chroma_quality, 65);
  assert.equal(jpegOptions(settings).separate_chroma_quality, true);
  settings.advanced.jpeg.greyscale = true;
  assert.equal(jpegOptions(settings).color_space, 1);
  assert.equal(jpegOptions(settings).separate_chroma_quality, false);
});

test("batch caching considers only applicable advanced settings", async () => {
  const settings = {
    bounds: { width: 512, height: 512 },
    format: "source",
    qualityByFormat: { jpeg: 0.8, webp: 0.8 },
    colours: 0,
    advanced: sanitiseAdvanced(),
  };
  const calls = [];
  const processor = createBatchProcessor(async ({ id }) => {
    calls.push(id);
    return { id };
  });
  const sources = [
    { id: "png", sourceFormat: "png" },
    { id: "jpg", sourceFormat: "jpeg" },
  ];
  await processor.run(sources, settings, {}, () => {});
  settings.advanced = sanitiseAdvanced({
    jpeg: { encoder: "advanced", progressive: false },
  });
  await processor.run(sources, settings, {}, () => {});
  assert.deepEqual(calls, ["png", "jpg", "jpg"]);
  const lossless = {
    ...settings,
    format: "webp",
    quality: 0.8,
    advanced: sanitiseAdvanced({
      webp: { encoder: "advanced", mode: "lossless" },
    }),
  };
  assert.equal(
    settingsKey(lossless),
    settingsKey({ ...lossless, quality: 0.3 }),
  );
  const png = { ...settings, format: "png" };
  assert.equal(
    settingsKey(png),
    settingsKey({
      ...png,
      advanced: sanitiseAdvanced({ png: { dither: 100 } }),
    }),
  );
});
