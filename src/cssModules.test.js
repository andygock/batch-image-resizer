import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { preprocessCSS, resolveConfig } from "vite";
import config from "../vite.config.js";

const resolved = await resolveConfig({ ...config, configFile: false }, "serve");

test("comparison CSS keeps mounted class names valid after stylesheet edits", async () => {
  const file = new URL("./ImageInspector.module.css", import.meta.url);
  const source = await readFile(file, "utf8");
  const before = await preprocessCSS(source, fileURLToPath(file), resolved);
  const after = await preprocessCSS(
    `/* A hot stylesheet update. */\n${source}\n.hint { opacity: 0.9; }`,
    fileURLToPath(file),
    resolved,
  );
  assert.deepEqual(after.modules, before.modules);
  for (const name of [
    "inspector",
    "toolbar",
    "comparison",
    "imageViewport",
    "imageLayer",
    "before",
    "slider",
  ])
    assert.ok(
      after.code.includes(`.${before.modules[name]}`),
      `${name} remains styled`,
    );
  assert.match(after.code, /position: absolute/);
  assert.match(after.code, /clip-path: inset/);
});

test("CSS modules in different directories keep separate class names", async () => {
  const first = await preprocessCSS(
    ".controls { display: flex; }",
    fileURLToPath(new URL("./one/Panel.module.css", import.meta.url)),
    resolved,
  );
  const second = await preprocessCSS(
    ".controls { display: flex; }",
    fileURLToPath(new URL("./two/Panel.module.css", import.meta.url)),
    resolved,
  );
  assert.notEqual(first.modules.controls, second.modules.controls);
});
