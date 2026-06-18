#!/usr/bin/env node

/**
 * Cookie Consent CLI — scaffolds the Next.js template files into a project.
 * Plain JavaScript because it runs directly under Node at install time, with
 * no build step.
 */

import prompts from "prompts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM has no __dirname; reconstruct it from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// packageRoot: where this package is installed (source of templates/).
// targetRoot:  the user's project, where files are copied to.
const packageRoot = path.resolve(__dirname, "..");
const targetRoot = process.cwd();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect every file under a directory as absolute paths. */
function getAllFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? getAllFiles(fullPath) : [fullPath];
  });
}

/** Copy a file, creating any missing parent directories. */
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🍪 Cookie Consent Setup\n");

  const response = await prompts(
    [
      {
        type: "confirm",
        name: "confirmed",
        message: `This will copy the Next.js template files into your project at ${targetRoot}. Continue?`,
        initial: true,
      },
    ],
    {
      onCancel: () => {
        console.log("\n✖ Setup cancelled.\n");
        process.exit(0);
      },
    },
  );
  response.template = "nextjs";

  if (!response.confirmed) {
    console.log("\n✖ Setup cancelled.\n");
    process.exit(0);
  }

  // ─── Copy files ─────────────────────────────────────────────────────────────

  const templateDir = path.join(packageRoot, "templates", response.template);

  if (!fs.existsSync(templateDir)) {
    console.error(`\n✖ Template "${response.template}" not found.\n`);
    process.exit(1);
  }

  const files = getAllFiles(templateDir);
  const copied = [];
  const skipped = [];

  for (const srcFile of files) {
    // Get the path relative to the template folder, e.g.:
    //   components/cookies/CookieBanner.tsx
    const relativePath = path.relative(templateDir, srcFile);
    const destFile = path.join(targetRoot, relativePath);

    if (fs.existsSync(destFile)) {
      // Never overwrite existing files — they may hold the developer's edits.
      // Skip and report instead, so they can merge manually if they want.
      skipped.push(relativePath);
    } else {
      copyFile(srcFile, destFile);
      copied.push(relativePath);
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log("\n✔ Setup complete!\n");

  if (copied.length > 0) {
    console.log("Copied:");
    copied.forEach((f) => console.log(`  + ${f}`));
  }

  if (skipped.length > 0) {
    console.log("\nSkipped (already exist):");
    skipped.forEach((f) => console.log(`  ~ ${f}`));
  }

  const nextSteps = `
─────────────────────────────────────────────
Next steps:

  1. Add CookieConsentWrapper to your layout.tsx
  2. Set environment variables in .env.local:
       NEXT_PUBLIC_CONSENT_API=...
       NEXT_PUBLIC_SITE_CONSENT_TOKEN=...
       NEXT_PUBLIC_GA_MEASUREMENT_ID=...
       NEXT_PUBLIC_CF_ANALYTICS_TOKEN=...
  3. Update lib/site-config.ts (site name, policy
     URL, policy text)
  4. Customize the copied components to match
     your site's design

  Note: See detailed instructions in the README.md file.

─────────────────────────────────────────────
`;

  console.log(nextSteps);
}

main();
