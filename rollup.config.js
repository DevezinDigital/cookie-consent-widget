import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import peerDepsExternal from "rollup-plugin-peer-deps-external";

// Adds "use client" banner to output chunks so Next.js consumers correctly
// treat the imported modules as client components. Applied ONLY to the main
// (React) entry — the /constants entry stays server-safe (no banner) so
// Server Components can import pure data/types without the client tax.
const USE_CLIENT_BANNER = `"use client";`;

// Fresh plugin instances per build — the typescript plugin is stateful and
// cannot be shared across two config objects in the same array.
const makePlugins = () => [
  peerDepsExternal(),
  resolve(),
  commonjs(),
  typescript({
    tsconfig: "./tsconfig.json",
    declaration: true,
    declarationDir: "dist",
  }),
];

const external = ["@neondatabase/serverless", "@upstash/redis"];

export default [
  // ── Main entry (React provider, hooks, client surface) ──
  {
    input: "index.ts",
    output: [
      {
        file: "dist/index.js",
        format: "cjs",
        banner: USE_CLIENT_BANNER,
      },
      {
        file: "dist/index.esm.js",
        format: "esm",
        banner: USE_CLIENT_BANNER,
      },
    ],
    plugins: makePlugins(),
    external,
  },
  // ── Server-safe entry (constants, types, presets — NO "use client") ──
  {
    input: "constants.ts",
    output: [
      {
        file: "dist/constants.js",
        format: "cjs",
      },
      {
        file: "dist/constants.esm.js",
        format: "esm",
      },
    ],
    plugins: makePlugins(),
    external,
  },
];
