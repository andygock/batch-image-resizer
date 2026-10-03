import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { IDBFactory } from "fake-indexeddb";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { PREFERENCES_STORAGE_KEY } from "./preferences.js";
import { STORAGE_POLICY_KEY, STORAGE_CHANNEL, clearAppWebStorage } from "./storagePrivacy.js";
import { BATCH_DATABASE_NAME, clearBatch } from "./batchStorage.js";

const window = new Window({ url: "http://localhost/", settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
for (const key of ["window", "document", "HTMLElement", "HTMLAnchorElement", "localStorage", "sessionStorage", "navigator", "MouseEvent", "Event"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
}
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.indexedDB = new IDBFactory();
globalThis.createImageBitmap = async () => ({ width: 1200, height: 800, close() {} });
globalThis.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { return { fillRect() {}, drawImage() {} }; }
  async convertToBlob({ type }) { return new Blob(["output"], { type }); }
};
const { default: App } = await import("./App.jsx");
const { default: SizeSelect } = await import("./SizeSelect.jsx");
const { default: CompressionSelect } = await import("./CompressionSelect.jsx");
const { default: usePreferences } = await import("./usePreferences.js");
const root = document.createElement("div");
document.body.append(root);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => { await act(async () => { await tick(); }); };
const click = async (element) => { assert.ok(element, "Click target exists"); await act(() => element.click()); };
const change = async (element, value) => { await act(() => { element.value = value; element.dispatchEvent(new window.Event("input", { bubbles: true })); element.dispatchEvent(new window.Event("change", { bubbles: true })); }); };
const button = (text) => [...root.querySelectorAll("button")].find((element) => element.textContent === text);
const jpeg = (name = "photo.jpg") => new File([new Uint8Array([255, 216, 255, 1, 2, 3])], name, { type: "image/jpeg" });
const upload = async (files) => {
  const input = root.querySelector("#add-images");
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(() => input.dispatchEvent(new window.Event("change", { bubbles: true })));
  await settle();
};
const waitForSave = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)); });

test.afterEach(async () => {
  await act(() => render(null, root));
  localStorage.clear();
  sessionStorage.clear();
  globalThis.indexedDB = new IDBFactory();
});
test.after(() => window.happyDOM.abort());

test("custom dimensions commit only when the complete pair is submitted", async () => {
  const sizes = [];
  await act(() => render(h(SizeSelect, { width: 512, height: 512, onChange: (size) => sizes.push(size) }), root));
  await change(root.querySelector("select"), "custom");
  const width = root.querySelector("#custom-width"), height = root.querySelector("#custom-height");
  assert.equal(document.activeElement, width);
  await change(width, "900");
  await act(() => { width.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true, relatedTarget: height })); height.focus(); });
  assert.deepEqual(sizes, []);
  await change(height, "600");
  await act(() => height.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  assert.deepEqual(sizes, [{ width: 900, height: 600 }]);
  await change(width, "");
  await act(() => width.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(width.value, "512");
});

test("quality sliders commit on release and keep format values independent", async () => {
  const changes = [];
  await act(() => render(h(CompressionSelect, { format: "source", sourceFormats: ["jpeg", "webp"], qualityByFormat: { jpeg: 0.9, webp: 0.7 }, onQualityChange: (...args) => changes.push(args), pngColors: 0 }), root));
  const slider = root.querySelector("input[type=range]");
  await change(slider, "65");
  assert.deepEqual(changes, []);
  await act(() => slider.dispatchEvent(new window.Event("pointerup", { bubbles: true })));
  assert.deepEqual(changes, [["jpeg", 0.65]]);
  assert.equal(root.querySelector("#webp-quality-number").value, "70");
});

test("storage choices can be disabled, re-enabled and cleared without reappearing", async () => {
  let state;
  function Probe() { state = usePreferences(); return null; }
  await act(() => render(h(Probe), root));
  await act(() => state.forgetPreferences());
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_POLICY_KEY)).rememberPreferences, false);
  await act(() => state.setPreference("rememberPreferences", true));
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_POLICY_KEY)).rememberPreferences, true);
  await act(() => state.clearLocalData());
  await act(() => state.setPreference("suffix", "_private"));
  assert.equal(localStorage.getItem(PREFERENCES_STORAGE_KEY), null);
  assert.equal(localStorage.getItem(STORAGE_POLICY_KEY), null);
});

test("clear all removes database, web storage, pending work and undo without re-saving", async () => {
  await act(() => render(h(App), root));
  await settle();
  const input = root.querySelector("#add-images");
  Object.defineProperty(input, "files", { configurable: true, value: [jpeg()] });
  await act(() => input.dispatchEvent(new window.Event("change", { bubbles: true })));
  await settle();
  assert.equal(root.querySelectorAll(".imageCard").length, 1);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  assert.ok((await indexedDB.databases()).some(({ name }) => name === BATCH_DATABASE_NAME));
  localStorage.setItem("unrelated", "keep");
  sessionStorage.setItem("batch-image-resizer:old-session", "remove");
  sessionStorage.setItem("unrelated", "keep");
  await click(button("Clear all app data and current batch"));
  await settle();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
  assert.equal(root.querySelectorAll(".imageCard").length, 0);
  assert.equal(button("Undo removal"), undefined);
  assert.deepEqual(await indexedDB.databases(), []);
  assert.equal(localStorage.getItem(PREFERENCES_STORAGE_KEY), null);
  assert.equal(localStorage.getItem(STORAGE_POLICY_KEY), null);
  assert.equal(sessionStorage.getItem("batch-image-resizer:old-session"), null);
  assert.equal(localStorage.getItem("unrelated"), "keep");
  assert.equal(sessionStorage.getItem("unrelated"), "keep");
});

test("ready cards remain usable and paused edits stay paused with undo", async (t) => {
  let release;
  t.mock.method(globalThis, "createImageBitmap", async (file) => file.name === "later.jpg"
    ? new Promise((resolve) => { release = resolve; })
    : { width: 1200, height: 800, close() {} });
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await upload([new File([new Uint8Array([255, 216, 255, 4])], "later.jpg")]);
  assert.equal(root.querySelectorAll(".imageCard").length, 2);
  assert.equal(root.querySelectorAll(".imageCard a[download]").length, 1);
  await click(root.querySelector("button[aria-label='Pause processing']"));
  await click(root.querySelector("button[aria-label='Remove photo.jpg']"));
  assert.ok(root.querySelector("button[aria-label='Resume processing']"));
  await click(button("Undo removal"));
  assert.equal(root.querySelectorAll(".imageCard").length, 2);
  assert.equal(root.querySelectorAll(".imageCard a[download]").length, 1);
  assert.ok(root.querySelector("button[aria-label='Resume processing']"));
  assert.equal(root.querySelector(".imageCard input[type=checkbox]").checked, false);
  release({ width: 1200, height: 800, close() {} });
  await settle();
});

test("range selection and keyboard removal retain the nearest context", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([1, 2, 3].map((number) => new File([new Uint8Array([255, 216, 255, number])], `${number}.jpg`)));
  const checkboxes = [...root.querySelectorAll(".imageCard input[type=checkbox]")];
  await click(checkboxes[0]);
  await act(() => checkboxes[2].dispatchEvent(new window.MouseEvent("click", { shiftKey: true, bubbles: true })));
  assert.equal(root.querySelectorAll(".imageCard input:checked").length, 3);
  await click(button("Clear selection"));
  const remove = root.querySelector("button[aria-label='Remove 2.jpg']");
  remove.focus();
  await click(remove);
  await settle();
  assert.ok(document.activeElement.closest(".imageCard").textContent.includes("3.jpg"));
});

test("overlapping uploads skip duplicates and intentional duplication remains available", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await upload([jpeg("another-name.jpg")]);
  assert.equal(root.querySelectorAll(".imageCard").length, 1);
  await click(button("Add duplicates anyway"));
  await settle();
  assert.equal(root.querySelectorAll(".imageCard").length, 2);
  assert.equal(button("Add duplicates anyway"), undefined);
});

test("reload restores files, selection and committed settings", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await click(root.querySelector(".imageCard input[type=checkbox]"));
  await change(root.querySelector("#size"), "1024x1024");
  await settle();
  await waitForSave();
  await act(() => render(null, root));
  await act(() => render(h(App), root));
  await settle();
  await settle();
  assert.equal(root.querySelectorAll(".imageCard").length, 1);
  assert.equal(root.querySelector(".imageCard input[type=checkbox]").checked, true);
  assert.equal(root.querySelector("#size").value, "1024x1024");
});

test("reload preserves collision filenames and download request markers", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg(), new File([new Uint8Array([255, 216, 255, 4])], "photo.jpg")]);
  const cards = [...root.querySelectorAll(".imageCard")];
  await click(cards[0].querySelector("button[aria-label='Remove photo.jpg']"));
  await settle();
  const download = root.querySelector(".imageCard a[download]");
  const filename = download.download;
  assert.match(filename, /\(2\)/);
  download.addEventListener("click", (event) => event.preventDefault());
  await click(download);
  await waitForSave();
  await act(() => render(null, root));
  await act(() => render(h(App), root));
  for (let attempt = 0; attempt < 20 && !root.querySelector(".imageCard a[download]"); attempt++) await settle();
  assert.equal(root.querySelector(".imageCard a[download]").download, filename);
  assert.match(root.querySelector(".imageCard").textContent, /Download requested/);
});

test("single-image quality trials do not change the batch until applied", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await click(root.querySelector("button[aria-label='Compare photo.jpg']"));
  await change(root.querySelector("#trial-jpeg-quality-number"), "60");
  await act(() => root.querySelector("#trial-jpeg-quality-number").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 230)); });
  assert.equal(root.querySelector("#jpeg-quality-number").value, "80");
  assert.equal(button("Apply to batch").disabled, false);
  await click(button("Apply to batch"));
  await settle();
  assert.equal(root.querySelector("#jpeg-quality-number").value, "60");
});

test("a clear-data message pauses saving in another open tab", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await waitForSave();
  const otherTab = new BroadcastChannel(STORAGE_CHANNEL);
  try {
    otherTab.postMessage("all");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
    await clearBatch();
    clearAppWebStorage("local");
    await change(root.querySelector("input[aria-label='Filename suffix']"), "_new");
    await waitForSave();
    assert.equal(localStorage.getItem(PREFERENCES_STORAGE_KEY), null);
    assert.equal(localStorage.getItem(STORAGE_POLICY_KEY), null);
    assert.deepEqual(await indexedDB.databases(), []);
    assert.equal(root.querySelectorAll(".imageCard").length, 1);
  } finally { otherTab.close(); }
});
import "../test-support/register.js";
