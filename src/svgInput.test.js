import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { prepareSvg } from "./svgInput.js";

const window = new Window();
globalThis.DOMParser = window.DOMParser;
globalThis.XMLSerializer = window.XMLSerializer;
test.after(() => window.happyDOM.abort());
const signal = new AbortController().signal;
const svg = (attributes, content = "") =>
  new Blob([
    `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${content}</svg>`,
  ]);

test("SVG viewBox and physical lengths resolve to explicit pixel dimensions", async () => {
  for (const [attributes, width, height] of [
    ['viewBox="0 0 600 300"', 600, 300],
    ['width="1in" height="25.4mm"', 96, 96],
    ['width="200" viewBox="0 0 600 300"', 200, 100],
    ["", 300, 150],
  ]) {
    const prepared = await prepareSvg(svg(attributes), signal);
    assert.deepEqual([prepared.width, prepared.height], [width, height]);
    assert.match(await prepared.file.text(), new RegExp(`width="${width}"`));
    assert.equal(prepared.file.type, "image/svg+xml");
  }
});

test("SVG vectors render at the target resolution while retaining source dimensions", async () => {
  const prepared = await prepareSvg(svg('viewBox="0 0 100 50"'), signal, {
    bounds: { width: 1000, height: 1000 },
    disableUpscale: false,
  });
  assert.deepEqual([prepared.width, prepared.height], [100, 50]);
  assert.match(await prepared.file.text(), /width="1000"/);
  assert.match(await prepared.file.text(), /height="500"/);
});

test("SVG rejects invalid documents, oversized dimensions and entity declarations", async () => {
  await assert.rejects(prepareSvg(new Blob(["<html/>"]), signal), /invalid/);
  await assert.rejects(prepareSvg(svg('viewBox="0 0 0 2"'), signal), /viewBox/);
  await assert.rejects(
    prepareSvg(svg('width="8192" height="8192"'), signal),
    /33,554,432/,
  );
  await assert.rejects(
    prepareSvg(new Blob(['<!DOCTYPE svg [<!ENTITY x "test">]><svg/>']), signal),
    /entity/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(prepareSvg(svg(""), controller.signal), {
    name: "AbortError",
  });
});
