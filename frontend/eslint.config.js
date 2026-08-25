/**
 * Lint configuration — IMAP frontend
 *
 * WHY THIS EXISTS
 * ───────────────
 * There was no linter, and vite does not resolve identifiers — esbuild
 * strips types and bundles, it does not ask whether `Paragraph` is defined.
 * So a component referencing an identifier that was never imported BUILT
 * CLEANLY and crashed the moment a user opened that tab. That is exactly
 * what happened while writing the verification review screen: the build
 * said ✓, and the panel would have thrown `Paragraph is not defined` in
 * front of an operator.
 *
 * `no-undef` is the rule that matters here and it is an error. The rest are
 * chosen to catch the same class of thing — a mistake a build cannot see —
 * rather than to enforce a style.
 *
 * WHAT IS DELIBERATELY NOT ENABLED
 * ────────────────────────────────
 * Formatting rules, and the stricter half of the React Hooks set. This is a
 * large existing codebase; turning on rules that flag thousands of lines
 * would produce a number nobody reads and a `--max-warnings` threshold that
 * only ever goes up. The rules below are the ones that catch bugs, and they
 * pass at zero.
 */
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "public/**", "vite-plugins/**", "*.config.js"],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...js.configs.recommended.rules,

      // ── the one that would have caught the crash ──────────
      "no-undef": "error",
      // JSX counts as a use. Without this, every imported component reads
      // as unused and the signal is lost in the noise.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",

      // ── other mistakes a build cannot see ─────────────────
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-dupe-class-members": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "no-self-assign": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      // `catch {}` is used deliberately in places where a failure genuinely
      // does not change what happens next, so the empty block is allowed
      // there and nowhere else.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-cond-assign": "error",
      "no-sparse-arrays": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-obj-calls": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "require-atomic-updates": "off",

      // ── hooks: the rule that causes stale-state bugs ──────
      "react-hooks/rules-of-hooks": "error",
      // Exhaustive-deps is a warning, not an error. It is frequently right
      // and occasionally wrong, and making it fatal on an existing codebase
      // rewards silencing it with a disable comment.
      "react-hooks/exhaustive-deps": "warn",

      // Unused variables are worth seeing but not worth blocking a build;
      // an argument prefixed with _ is an explicit "I know".
      "no-unused-vars": ["warn", {
        args: "after-used",
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },
  {
    // Node scripts in the repo root tooling, if any are ever linted.
    files: ["scripts/**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
];
