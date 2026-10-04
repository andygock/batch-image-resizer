import "../test-support/register.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { PREFERENCES_STORAGE_KEY } from "./preferences.js";

const window = new Window({
  url: "http://localhost/",
  settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true },
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "HTMLAnchorElement",
  "localStorage",
  "sessionStorage",
  "navigator",
  "MouseEvent",
  "Event",
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === "window" ? window : window[key],
  });
}
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.createImageBitmap = async () => ({
  width: 1200,
  height: 800,
  close() {},
});
globalThis.OffscreenCanvas = class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return { fillRect() {}, drawImage() {} };
  }
  async convertToBlob({ type }) {
    return new Blob(["output"], { type });
  }
};
const { default: App } = await import("./App.jsx");
const { default: SizeSelect } = await import("./SizeSelect.jsx");
const { default: CompressionSelect } = await import("./CompressionSelect.jsx");
const { default: usePreferences } = await import("./usePreferences.js");
const root = document.createElement("div");
document.body.append(root);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  await act(async () => {
    await tick();
  });
};
const click = async (element) => {
  assert.ok(element, "Click target exists");
  await act(() => element.click());
};
const change = async (element, value) => {
  await act(() => {
    element.value = value;
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
};
const button = (text) =>
  [...root.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  );
const jpeg = (name = "photo.jpg") =>
  new File([new Uint8Array([255, 216, 255, 1, 2, 3])], name, {
    type: "image/jpeg",
  });
const upload = async (files) => {
  const input = root.querySelector("#add-images");
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(() =>
    input.dispatchEvent(new window.Event("change", { bubbles: true })),
  );
  await settle();
};
test.afterEach(async () => {
  await act(() => render(null, root));
  localStorage.clear();
  sessionStorage.clear();
});
test.after(() => window.happyDOM.abort());

const labelledControl = (text, within = root) => {
  const label = [...within.querySelectorAll("label")].find(
    (element) => element.textContent.trim() === text,
  );
  assert.ok(label, `Label exists: ${text}`);
  return (
    document.getElementById(label.htmlFor) ||
    label.querySelector("input, select")
  );
};

test("advanced settings are staged, validated, saved per format and restored", async () => {
  await act(() => render(h(App), root));
  await settle();
  const trigger = button("Advanced");
  trigger.focus();
  await click(trigger);
  await change(labelledControl("Encoder"), "advanced");
  await change(labelledControl("Compression mode"), "near-lossless");
  await change(labelledControl("Near-lossless fidelity"), "45");
  assert.equal(localStorage.getItem(PREFERENCES_STORAGE_KEY), null);
  await click(button("Cancel"));
  assert.equal(document.activeElement, trigger);
  await click(trigger);
  assert.equal(labelledControl("Encoder").value, "browser");
  await change(labelledControl("Encoder"), "advanced");
  await change(labelledControl("Compression mode"), "near-lossless");
  await change(labelledControl("Near-lossless fidelity"), "101");
  assert.equal(button("Apply settings").disabled, true);
  await click(button("PNG"));
  await change(root.querySelector("#advanced-png-colors"), "4");
  await change(labelledControl("Dithering strength (%)"), "75");
  assert.equal(button("Apply settings").disabled, true);
  await click(button("WebP"));
  await change(labelledControl("Near-lossless fidelity"), "45");
  await click(button("Apply settings"));
  await settle();
  assert.equal(root.querySelector("dialog"), null);
  const saved = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY));
  assert.equal(saved.advanced.webp.mode, "near-lossless");
  assert.equal(saved.advanced.webp.nearLossless, 45);
  assert.equal(saved.advanced.png.dither, 75);
  assert.equal(saved.pngColors, 4);
  await act(() => render(null, root));
  await act(() => render(h(App), root));
  await settle();
  await click(button("Advanced"));
  assert.equal(labelledControl("Near-lossless fidelity").value, "45");
  await click(button("Reset WebP"));
  assert.equal(labelledControl("Encoder").value, "browser");
  await click(button("PNG"));
  assert.equal(labelledControl("Dithering strength (%)").value, "75");
});

test("advanced trial settings stay isolated and nested dismissal retains the comparison", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await click(root.querySelector("button[aria-label='Compare photo.jpg']"));
  const comparison = root.querySelector("dialog");
  const advancedTrigger = [...comparison.querySelectorAll("button")].find(
    (element) => element.textContent === "Advanced",
  );
  advancedTrigger.focus();
  await click(advancedTrigger);
  const child = comparison.querySelector("dialog");
  await act(() =>
    child.dispatchEvent(
      new window.Event("cancel", { cancelable: true, bubbles: true }),
    ),
  );
  assert.equal(root.querySelectorAll("dialog").length, 1);
  assert.equal(document.activeElement, advancedTrigger);
  await click(advancedTrigger);
  await click(button("JPEG"));
  await change(labelledControl("Transparency background"), "#123456");
  await click(button("Apply to trial"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 230));
  });
  assert.equal(button("Apply to batch").disabled, false);
  assert.equal(
    JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || "{}").advanced
      ?.jpeg?.background,
    undefined,
  );
  await click(button("Apply to batch"));
  await settle();
  assert.equal(
    JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)).advanced.jpeg
      .background,
    "#123456",
  );
});

test("PNG dithering is disabled without a palette and lossless WebP hides lossy quality", async () => {
  await act(() => render(h(App), root));
  await settle();
  await click(button("Advanced"));
  await click(button("PNG"));
  assert.equal(labelledControl("Dithering strength (%)").disabled, true);
  await change(root.querySelector("#advanced-png-colors"), "2");
  assert.equal(labelledControl("Dithering strength (%)").disabled, false);
  await click(button("WebP"));
  await change(labelledControl("Encoder"), "advanced");
  await change(labelledControl("Compression mode"), "lossless");
  assert.equal(root.querySelector("#advanced-webp-quality-number"), null);
  assert.equal(labelledControl("Lossless compression effort").value, "75");
});

test("custom dimensions commit only when the complete pair is submitted", async () => {
  const sizes = [];
  await act(() =>
    render(
      h(SizeSelect, {
        width: 512,
        height: 512,
        onChange: (size) => sizes.push(size),
      }),
      root,
    ),
  );
  await change(root.querySelector("select"), "custom");
  const width = root.querySelector("#custom-width"),
    height = root.querySelector("#custom-height");
  assert.equal(document.activeElement, width);
  await change(width, "900");
  await act(() => {
    width.dispatchEvent(
      new window.FocusEvent("focusout", {
        bubbles: true,
        relatedTarget: height,
      }),
    );
    height.focus();
  });
  assert.deepEqual(sizes, []);
  await change(height, "600");
  await act(() =>
    height.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  assert.deepEqual(sizes, [{ width: 900, height: 600 }]);
  await change(width, "");
  await act(() =>
    width.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  assert.equal(width.value, "512");
});

test("quality sliders commit on release and keep format values independent", async () => {
  const changes = [];
  await act(() =>
    render(
      h(CompressionSelect, {
        format: "source",
        sourceFormats: ["jpeg", "webp"],
        qualityByFormat: { jpeg: 0.9, webp: 0.7 },
        onQualityChange: (...args) => changes.push(args),
        pngColors: 0,
      }),
      root,
    ),
  );
  const slider = root.querySelector("input[type=range]");
  await change(slider, "65");
  assert.deepEqual(changes, []);
  await act(() =>
    slider.dispatchEvent(new window.Event("pointerup", { bubbles: true })),
  );
  assert.deepEqual(changes, [["jpeg", 0.65]]);
  assert.equal(root.querySelector("#webp-quality-number").value, "70");
});

test("preferences can be disabled, re-enabled and cleared without reappearing", async () => {
  let state;
  function Probe() {
    state = usePreferences();
    return null;
  }
  await act(() => render(h(Probe), root));
  await act(() => state.setPreference("suffix", "_saved"));
  assert.equal(
    JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)).suffix,
    "_saved",
  );
  await act(() => state.setPreference("rememberPreferences", false));
  await act(() => state.setPreference("suffix", "_private"));
  await act(() => render(null, root));
  await act(() => render(h(Probe), root));
  assert.equal(state.preferences.rememberPreferences, false);
  assert.equal(state.preferences.suffix, "_small");
  await act(() => state.setPreference("rememberPreferences", true));
  await act(() => state.setPreference("suffix", "_remembered"));
  assert.equal(
    JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)).suffix,
    "_remembered",
  );
  await act(() => state.forgetPreferences());
  await act(() => state.setPreference("suffix", "_private"));
  assert.equal(localStorage.getItem(PREFERENCES_STORAGE_KEY), null);
  await act(() => state.setPreference("rememberPreferences", true));
  assert.equal(
    JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)).suffix,
    "_private",
  );
});

test("the menu gear opens preference controls in a dismissible modal", async () => {
  await act(() => render(h(App), root));
  await settle();
  const gear = root.querySelector("button[aria-label='Saved preferences']");
  assert.equal(root.querySelector("dialog"), null);
  gear.focus();
  await click(gear);
  const dialog = root.querySelector("dialog");
  assert.equal(dialog.open, true);
  assert.equal(
    document.getElementById(dialog.getAttribute("aria-labelledby")).textContent,
    "Saved preferences",
  );
  assert.ok(button("Clear saved preferences"));
  assert.equal(dialog.querySelectorAll("input[type=checkbox]").length, 1);
  assert.equal(dialog.querySelectorAll(".dataActions button").length, 1);
  await click(
    root.querySelector("button[aria-label='Close saved preferences']"),
  );
  assert.equal(root.querySelector("dialog"), null);
  assert.equal(document.activeElement, gear);

  await click(gear);
  await act(() =>
    root
      .querySelector("dialog")
      .dispatchEvent(new window.Event("cancel", { cancelable: true })),
  );
  assert.equal(root.querySelector("dialog"), null);
  assert.equal(document.activeElement, gear);
});

test("toolbar clear removes the batch and keeps saved preferences", async () => {
  await act(() => render(h(App), root));
  await settle();
  await change(root.querySelector("#size"), "1024x1024");
  await upload([jpeg()]);
  await click(root.querySelector(".imageCard input[type=checkbox]"));
  const saved = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  localStorage.setItem("unrelated", "keep");
  sessionStorage.setItem("unrelated", "keep");
  await click(button("Clear"));
  await settle();
  assert.equal(root.querySelectorAll(".imageCard").length, 0);
  assert.equal(root.querySelector("#size").value, "1024x1024");
  assert.equal(localStorage.getItem(PREFERENCES_STORAGE_KEY), saved);
  assert.equal(localStorage.getItem("unrelated"), "keep");
  assert.equal(sessionStorage.getItem("unrelated"), "keep");
  await upload([jpeg()]);
  assert.equal(root.querySelectorAll(".imageCard").length, 1);
  assert.equal(
    root.querySelector(".imageCard input[type=checkbox]").checked,
    false,
  );
});

test("clearing preferences keeps images and reports storage failures for retry", async (t) => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await change(
    root.querySelector("input[aria-label='Filename suffix']"),
    "_saved",
  );
  await click(root.querySelector("button[aria-label='Saved preferences']"));
  const remove = t.mock.method(localStorage, "removeItem", () => {
    throw new Error("Storage is blocked");
  });
  await click(button("Clear saved preferences"));
  assert.match(root.textContent, /Could not clear preferences/);
  remove.mock.restore();
  await click(button("Clear saved preferences"));
  await settle();
  assert.equal(localStorage.getItem(PREFERENCES_STORAGE_KEY), null);
  assert.equal(root.querySelectorAll(".imageCard").length, 1);
  assert.equal(
    root.querySelector("input[aria-label='Filename suffix']").value,
    "_saved",
  );
});

test("deletion cannot be undone and paused edits stay paused", async (t) => {
  let release;
  t.mock.method(globalThis, "createImageBitmap", async (file) =>
    file.name === "later.jpg"
      ? new Promise((resolve) => {
          release = resolve;
        })
      : { width: 1200, height: 800, close() {} },
  );
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await upload([new File([new Uint8Array([255, 216, 255, 4])], "later.jpg")]);
  assert.equal(root.querySelectorAll(".imageCard").length, 2);
  assert.equal(root.querySelectorAll(".imageCard a[download]").length, 1);
  await click(root.querySelector("button[aria-label='Pause processing']"));
  await click(root.querySelector("button[aria-label='Remove photo.jpg']"));
  assert.ok(root.querySelector("button[aria-label='Resume processing']"));
  assert.equal(button("Undo removal"), undefined);
  await act(() =>
    document.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
      }),
    ),
  );
  assert.equal(root.querySelectorAll(".imageCard").length, 1);
  assert.equal(root.querySelectorAll(".imageCard a[download]").length, 0);
  assert.ok(root.querySelector("button[aria-label='Resume processing']"));
  assert.equal(
    root.querySelector(".imageCard input[type=checkbox]").checked,
    false,
  );
  release({ width: 1200, height: 800, close() {} });
  await settle();
});

test("range selection and keyboard removal retain the nearest context", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload(
    [1, 2, 3].map(
      (number) =>
        new File([new Uint8Array([255, 216, 255, number])], `${number}.jpg`),
    ),
  );
  const checkboxes = [
    ...root.querySelectorAll(".imageCard input[type=checkbox]"),
  ];
  await click(checkboxes[0]);
  await act(() =>
    checkboxes[2].dispatchEvent(
      new window.MouseEvent("click", { shiftKey: true, bubbles: true }),
    ),
  );
  assert.equal(root.querySelectorAll(".imageCard input:checked").length, 3);
  await click(button("Clear selection"));
  const remove = root.querySelector("button[aria-label='Remove 2.jpg']");
  remove.focus();
  await click(remove);
  await settle();
  assert.ok(
    document.activeElement.closest(".imageCard").textContent.includes("3.jpg"),
  );
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

test("transient decode failures become ready outputs without a Retry click", async (t) => {
  const decode = globalThis.createImageBitmap;
  let attempts = 0;
  t.mock.method(globalThis, "createImageBitmap", async (file) => {
    if (++attempts % 2 === 1)
      throw new DOMException(
        "The image could not be decoded",
        "InvalidStateError",
      );
    return decode(file);
  });
  await act(() => render(h(App), root));
  await settle();
  await change(root.querySelector("#output-format"), "jpeg");
  await upload([jpeg("ComfyUI_temp.jpg")]);
  for (const [format, extension] of [
    ["jpeg", "jpg"],
    ["webp", "webp"],
    ["jpeg", "jpg"],
  ]) {
    await change(root.querySelector("#output-format"), format);
    for (let attempt = 0; attempt < 20; attempt++) {
      await settle();
      if (root.querySelector(`a[download$='.${extension}']`)) break;
    }
    assert.ok(root.querySelector(`a[download$='.${extension}']`));
    assert.doesNotMatch(root.textContent, /Could not decode|Could not process/);
    assert.equal(button("Retry"), undefined);
  }
  assert.equal(attempts, 6);
});

test("reload keeps menu preferences and discards the batch", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await click(root.querySelector(".imageCard input[type=checkbox]"));
  await change(root.querySelector("#size"), "1024x1024");
  await settle();
  await act(() => render(null, root));
  await act(() => render(h(App), root));
  await settle();
  await settle();
  assert.equal(root.querySelectorAll(".imageCard").length, 0);
  assert.equal(root.querySelector("#size").value, "1024x1024");
});

test("format changes use imported bytes after the temporary file disappears", async (t) => {
  const original = jpeg("ComfyUI_temp.jpg");
  const expected = new Uint8Array(await original.arrayBuffer());
  let decodes = 0;
  const decode = globalThis.createImageBitmap;
  t.mock.method(globalThis, "createImageBitmap", async (file) => {
    assert.notEqual(file, original);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), expected);
    decodes++;
    return decode(file);
  });
  const worker = globalThis.Worker;
  globalThis.Worker = class {
    postMessage() {
      this.onmessage({ data: { fallback: true } });
    }
    terminate() {}
  };
  t.after(() => {
    if (worker === undefined) delete globalThis.Worker;
    else globalThis.Worker = worker;
  });
  t.mock.method(globalThis.OffscreenCanvas.prototype, "getContext", () => ({
    fillRect() {},
    drawImage() {},
    getImageData() {
      return { data: new Uint8ClampedArray(4) };
    },
  }));
  await act(() => render(h(App), root));
  await settle();
  await upload([original]);
  original.slice = () => {
    throw new DOMException("Temporary file removed", "NotReadableError");
  };
  for (const format of ["webp", "png", "jpeg", "webp", "png", "source"]) {
    await change(root.querySelector("#output-format"), format);
    for (let attempt = 0; attempt < 20; attempt++) {
      await settle();
      const extension =
        format === "source" || format === "jpeg" ? "jpg" : format;
      if (root.querySelector("a[download]")?.download.endsWith(`.${extension}`))
        break;
    }
    const extension = format === "source" || format === "jpeg" ? "jpg" : format;
    assert.ok(root.querySelector(`a[download$='.${extension}']`));
    assert.doesNotMatch(root.textContent, /Could not decode/);
  }
  assert.equal(decodes, 7);
});

test("native downloads preserve card content and collision filenames", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([
    jpeg(),
    new File([new Uint8Array([255, 216, 255, 4])], "photo.jpg"),
  ]);
  const cards = [...root.querySelectorAll(".imageCard")];
  await click(cards[0].querySelector("button[aria-label='Remove photo.jpg']"));
  await settle();
  const download = root.querySelector(".imageCard a[download]");
  const filename = download.download;
  assert.match(filename, /\(2\)/);
  const content = root.querySelector(".imageCard").textContent;
  const url = download.href;
  assert.match(url, /^blob:/);
  assert.equal(url, root.querySelector(".imageCard img").src);
  assert.equal(download.target, "");
  let prevented;
  document.addEventListener(
    "click",
    (event) => {
      prevented = event.defaultPrevented;
      // Suppress navigation only in the simulated DOM, after app handlers run.
      event.preventDefault();
    },
    { once: true },
  );
  await click(download);
  await settle();
  assert.equal(root.querySelector(".imageCard").textContent, content);
  assert.equal(prevented, false);
  assert.equal(download.href, url);
  assert.doesNotMatch(content, /Download requested/);
});

test("single-image quality trials do not change the batch until applied", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  await click(root.querySelector("button[aria-label='Compare photo.jpg']"));
  await change(root.querySelector("#trial-jpeg-quality-number"), "60");
  await act(() =>
    root
      .querySelector("#trial-jpeg-quality-number")
      .dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 230));
  });
  assert.equal(root.querySelector("#jpeg-quality-number").value, "80");
  assert.equal(button("Apply to batch").disabled, false);
  await click(button("Apply to batch"));
  await settle();
  assert.equal(root.querySelector("#jpeg-quality-number").value, "60");
});

test("comparison modal supports pointer and keyboard sliding, navigation and dismissal", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([
    jpeg(),
    new File([new Uint8Array([255, 216, 255, 4])], "next.jpg"),
  ]);
  const trigger = root.querySelector("button[aria-label='Compare photo.jpg']");
  trigger.focus();
  await click(trigger);
  const dialog = root.querySelector("dialog");
  assert.equal(dialog.open, true);
  assert.equal(
    document.getElementById(dialog.getAttribute("aria-labelledby")).textContent,
    "Image comparison",
  );
  const slider = dialog.querySelector('[role="slider"]');
  const comparison = dialog.querySelector(".comparison");
  const toolbar = dialog.querySelector(".toolbar");
  assert.ok(toolbar.querySelector("button[aria-label='Next image']"));
  assert.equal(toolbar.querySelector(".compareControls select"), null);
  assert.equal(slider.getAttribute("aria-valuenow"), "50");
  comparison.getBoundingClientRect = () => ({ left: 100, width: 400 });
  let captured = null;
  comparison.setPointerCapture = (id) => {
    captured = id;
  };
  comparison.hasPointerCapture = (id) => captured === id;
  comparison.releasePointerCapture = () => {
    captured = null;
  };
  const pointer = (type, clientX, pointerType = "mouse") =>
    act(() =>
      slider.dispatchEvent(
        new window.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType,
          button: 0,
          clientX,
        }),
      ),
    );
  await pointer("pointerdown", 200);
  assert.equal(slider.getAttribute("aria-valuenow"), "25");
  assert.equal(document.activeElement, slider);
  await pointer("pointermove", 400);
  assert.equal(slider.getAttribute("aria-valuenow"), "75");
  assert.equal(comparison.style.getPropertyValue("--split"), "75%");
  await pointer("pointermove", 600);
  assert.equal(slider.getAttribute("aria-valuenow"), "100");
  await pointer("pointerup", 600);
  assert.equal(captured, null);
  await pointer("pointermove", 200);
  assert.equal(slider.getAttribute("aria-valuenow"), "100");
  await pointer("pointerdown", 300, "touch");
  await pointer("pointermove", 0, "touch");
  assert.equal(slider.getAttribute("aria-valuenow"), "0");
  await pointer("pointercancel", 0, "touch");
  await pointer("pointermove", 400, "touch");
  assert.equal(slider.getAttribute("aria-valuenow"), "0");
  const key = (key) =>
    act(() =>
      slider.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  await key("ArrowRight");
  assert.equal(slider.getAttribute("aria-valuenow"), "1");
  assert.equal(dialog.querySelector("h3").textContent, "photo.jpg");
  await key("PageUp");
  assert.equal(slider.getAttribute("aria-valuenow"), "11");
  await key("End");
  assert.equal(slider.getAttribute("aria-valuenow"), "100");
  await key("Home");
  assert.equal(slider.getAttribute("aria-valuenow"), "0");
  await click(dialog.querySelector("button[aria-label='Next image']"));
  await settle();
  assert.equal(dialog.querySelector("h3").textContent, "next.jpg");
  assert.equal(slider.getAttribute("aria-valuenow"), "50");
  await act(() =>
    dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })),
  );
  assert.equal(root.querySelector("dialog"), null);
  assert.equal(document.activeElement, trigger);
});

test("100% comparison shares image dimensions and one pan position for both versions", async () => {
  await act(() => render(h(App), root));
  await settle();
  await upload([jpeg()]);
  for (
    let attempt = 0;
    attempt < 20 && !root.querySelector("a[download]");
    attempt++
  )
    await settle();
  assert.ok(root.querySelector("a[download]"));
  await click(root.querySelector("button[aria-label='Compare photo.jpg']"));
  const viewport = root.querySelector(".comparison .imageViewport");
  const canvas = viewport.querySelector(".imageCanvas");
  const images = [...canvas.querySelectorAll("img")];
  assert.equal(root.querySelectorAll(".comparison .imageViewport").length, 1);
  assert.equal(images.length, 2);
  assert.equal(images[0].width, images[1].width);
  assert.equal(images[0].height, images[1].height);
  assert.notEqual(images[0].width, 1200);
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 200 },
    clientHeight: { configurable: true, value: 200 },
    scrollWidth: { configurable: true, value: 700 },
    scrollHeight: { configurable: true, value: 600 },
  });
  let captured = null;
  viewport.setPointerCapture = (id) => {
    captured = id;
  };
  viewport.hasPointerCapture = (id) => captured === id;
  viewport.releasePointerCapture = () => {
    captured = null;
  };
  const pointer = (target, type, x, y, buttons = 1, pointerType = "mouse") =>
    act(() =>
      target.dispatchEvent(
        new window.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType,
          pointerId: 1,
          button: 0,
          buttons,
          clientX: x,
          clientY: y,
        }),
      ),
    );
  const position = () => [viewport.scrollLeft, viewport.scrollTop];

  await click(button("View at 100%"));
  assert.equal(canvas.style.width, `${images[0].width}px`);
  assert.equal(canvas.style.height, `${images[0].height}px`);
  await pointer(images[0], "pointerdown", 100, 100);
  assert.equal(viewport.hasPointerCapture(1), true);
  await pointer(images[0], "pointermove", 0, 20);
  assert.deepEqual(position(), [100, 80]);
  assert.equal(viewport.style.getPropertyValue("--reveal"), "200px");
  await pointer(images[0], "pointerup", 0, 20, 0);
  assert.equal(viewport.hasPointerCapture(1), false);
  assert.equal(viewport.dataset.panning, undefined);

  await pointer(images[1], "pointerdown", 100, 100);
  await pointer(images[1], "pointermove", 50, 60);
  assert.deepEqual(position(), [150, 120]);
  await pointer(images[1], "pointercancel", 50, 60, 0);
  await pointer(images[1], "pointermove", 0, 0);
  assert.deepEqual(position(), [150, 120]);

  await act(() => {
    viewport.scrollLeft = 250;
    viewport.scrollTop = 200;
    viewport.dispatchEvent(new window.Event("scroll"));
  });
  assert.deepEqual(position(), [250, 200]);
  assert.equal(viewport.style.getPropertyValue("--reveal"), "350px");
  const slider = root.querySelector('[role="slider"]');
  await act(() =>
    slider.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  assert.deepEqual(position(), [250, 200]);
  assert.equal(viewport.style.getPropertyValue("--reveal"), "352px");

  await pointer(images[1], "pointerdown", 100, 100, 1, "touch");
  await pointer(images[1], "pointermove", 50, 50, 1, "touch");
  assert.deepEqual(position(), [300, 250]);
  await pointer(images[1], "pointerup", 50, 50, 0, "touch");
  await pointer(images[0], "pointerdown", 100, 100);
  await pointer(images[0], "pointermove", -2000, -2000);
  assert.deepEqual(position(), [500, 400]);
  await pointer(images[0], "pointermove", 2000, 2000);
  assert.deepEqual(position(), [0, 0]);
  await pointer(images[0], "pointermove", 0, 0);
  await click(button("Fit previews"));
  assert.deepEqual(position(), [0, 0]);
  assert.equal(viewport.hasPointerCapture(1), false);
  assert.equal(canvas.style.width, "");
  await pointer(images[0], "pointerdown", 100, 100);
  await pointer(images[0], "pointermove", 0, 0);
  assert.deepEqual(position(), [0, 0]);
});
