const { defineConfig } = require("eslint/config");
const js = require("@eslint/js");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const globals = require("globals");

module.exports = defineConfig([
  // Ignore build and deps
  { ignores: ["dist/**", "node_modules/**"] },

  // Base recommended JS rules
  js.configs.recommended,

  // Project-specific overrides for JS/JSX files
  {
    files: ["**/*.{js,jsx}"],
    plugins: { react: reactPlugin, "react-hooks": reactHooksPlugin },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: "18.2" } },
    rules: {
      "react/jsx-no-target-blank": "off",
      "react/prop-types": "off",
      "no-unused-vars": "off",
    },
  },
]);
