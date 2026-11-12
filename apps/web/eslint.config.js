import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "eslint.config.js", "dev-harness/**"],
  },
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    linterOptions: {
      // Legacy disable comments remain in the tree; don't fail CI on them.
      reportUnusedDisableDirectives: "off",
    },
    settings: {
      react: {
        version: "19.2",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // eslint-plugin-react-hooks v7 "recommended" adds React Compiler rules
      // (set-state-in-effect, refs, immutability, ...). Keep the v4 behaviour
      // until those are adopted deliberately.
      "react-hooks/rules-of-hooks": "error",
      "no-extra-semi": "off",
      // On in the fork: a merge once shipped JSX referencing hook state that was never
      // returned (every page crashed at runtime while build/tests passed).
      "no-undef": "error",
      "no-unused-vars": "off",
      "react/no-unknown-property": "off",
      "react/prop-types": "off",
      "react-hooks/exhaustive-deps": "off",
      // Route modules export many page components from one file.
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // Node test files and build scripts.
    files: ["**/*.test.js", "test/**/*.js", "scripts/**/*.{js,mjs}", "vite.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Service workers (sw.js also exports helpers to Node tests via `module`).
    files: ["public/*.js"],
    languageOptions: { globals: { ...globals.serviceworker, module: "readonly" } },
  },
];
