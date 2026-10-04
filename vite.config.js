import { createHash } from "node:crypto";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  css: {
    modules: {
      // Keep mounted components styled when CSS changes during hot reload.
      generateScopedName(name, filename) {
        const path = relative(
          fileURLToPath(new URL(".", import.meta.url)),
          filename,
        ).replaceAll("\\", "/");
        const scope = createHash("sha256")
          .update(path)
          .digest("hex")
          .slice(0, 8);
        return `_${name}_${scope}`;
      },
    },
  },
  worker: { format: "es" },
  optimizeDeps: {
    exclude: [
      "@jsquash/webp",
      "@jsquash/jpeg",
      "@jsquash/oxipng",
      "@jsquash/avif",
    ],
  },
  plugins: [
    preact(),
    // visualizer({ filename: "dist/bundle-analysis.html", open: true }),
  ],
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom/test-utils": "preact/test-utils",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
    },
  },
});
