// Match Vite's ?url imports while exercising real encoders without a browser.
// The test's fetch handler serves these URLs exclusively from local files.
export async function load(url, context, nextLoad) {
  if (url.endsWith(".wasm?url")) {
    const local = new URL(url);
    local.search = "";
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${JSON.stringify(`https://local-wasm.invalid/${encodeURIComponent(local.href)}`)};`,
    };
  }
  return nextLoad(url, context);
}
