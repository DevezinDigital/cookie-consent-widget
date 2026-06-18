// eslint.config.js — flat config
//
// Lints the package source (TS/TSX), the serverless API (JS), and the Next.js
// templates. Not type-checked linting (kept fast and free of cross-project
// import-resolution noise); `npm run typecheck` covers types separately.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared language options — both browser and node globals are present
  // across this repo (client components + serverless handlers).
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // React hooks rules for the component/provider surface.
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Project-specific rule tuning.
  {
    rules: {
      // Allow intentionally-unused args prefixed with _.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
