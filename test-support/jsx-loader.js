import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "react" || specifier === "react-dom") specifier = "preact/compat";
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    try { return await nextResolve(`${specifier}.js`, context); }
    catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
    specifier += ".jsx";
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) return { format: "module", shortCircuit: true, source: "export default new Proxy({}, { get: (_, key) => key });" };
  if (url.endsWith(".jsx")) {
    const source = await readFile(new URL(url), "utf8");
    const transformed = await transformWithOxc(source, fileURLToPath(url), { jsx: { runtime: "automatic", importSource: "preact" } });
    return { format: "module", shortCircuit: true, source: transformed.code };
  }
  return nextLoad(url, context);
}
