#!/usr/bin/env node
/**
 * Lint test: ensure every numeric MAD currency display in the UI uses the
 * unified `formatMAD` helper from `@/lib/format` instead of an ad-hoc
 * locale formatter (Intl.NumberFormat with a non-en-US locale, toFixed +
 * "MAD" suffix, toLocaleString + "MAD", etc.).
 *
 * Run via: `npm run test:format-mad` or `node scripts/check-mad-format.mjs`.
 *
 * Whitelist:
 *   - src/lib/format.ts            (the formatter itself)
 *   - src/lib/invoicePdf.ts        (PDF helper now delegates to formatMAD)
 *   - src/lib/paymentsExport.ts    (CSV/PDF export — uses formatMAD)
 *   - column header labels like "Amount (MAD)" / "الإيرادات (MAD)"
 *
 * The test scans `src/**\/*.{ts,tsx}` for forbidden patterns and exits with
 * a non-zero code on any violation.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

const ALLOWLISTED_FILES = new Set([
  "src/lib/format.ts",
  "src/lib/invoicePdf.ts",
  "src/lib/paymentsExport.ts",
]);

// Patterns that indicate a non-unified MAD currency display.
const FORBIDDEN_PATTERNS = [
  {
    name: "toFixed(...) followed by MAD literal",
    regex: /\.toFixed\(\s*\d+\s*\)[^;\n]{0,40}MAD/,
  },
  {
    name: "toLocaleString(...) followed by MAD literal",
    regex: /toLocaleString\([^)]*\)[^;\n]{0,40}MAD/,
  },
  {
    name: 'template literal "${...} MAD"',
    regex: /\$\{[^}]+\}\s*MAD\b/,
  },
  {
    name: "Intl.NumberFormat with non en-US locale used for currency display",
    // Flags fr-MA / ar-MA / fr-FR etc. for NumberFormat (not DateTimeFormat).
    regex: /Intl\.NumberFormat\(\s*["'`](?!en-US)[a-z]{2}-[A-Z]{2}["'`]/,
  },
];

// Lines that contain "MAD" / "د.م" as a header label / form field caption rather
// than a numeric value display. Matches things like:
//   "Amount (MAD)"   "الإيرادات (MAD)"   "تكلفة المنتج (د.م)"
const HEADER_LABEL = /\((MAD|د\.م)\)/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (ALLOWLISTED_FILES.has(rel)) continue;
  if (rel === "src/integrations/supabase/types.ts") continue;
  if (rel === "src/routeTree.gen.ts") continue;

  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Header labels like "Amount (MAD)" are intentional.
    if (HEADER_LABEL.test(line)) continue;
    for (const { name, regex } of FORBIDDEN_PATTERNS) {
      if (regex.test(line)) {
        violations.push({ file: rel, lineNo: i + 1, rule: name, line: line.trim() });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    `\n✗ Found ${violations.length} ad-hoc MAD currency formatting${violations.length === 1 ? "" : "s"}.`,
  );
  console.error("  Use formatMAD() from @/lib/format instead.\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.lineNo}  [${v.rule}]`);
    console.error(`    ${v.line}`);
  }
  console.error("");
  process.exit(1);
}

console.log("✓ All MAD currency displays use formatMAD().");
