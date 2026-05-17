/**
 * Static containment test for `supabaseAdmin` (service-role client).
 *
 * Walks the entire `src/` tree, finds every file that imports
 * `@/integrations/supabase/client.server` (directly or via a relative
 * path), and asserts the importer lives in an approved server-only
 * location. See `ADMIN_CLIENT_BOUNDARIES.md` for the policy.
 *
 * This is the last line of defense: ESLint catches violations during
 * development, but this test runs in `bun run test` (CI-gated) so a
 * lint-disable comment or a renamed import alias cannot smuggle the
 * admin client into the browser bundle.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");

const ALLOWED_PATTERNS: RegExp[] = [
  /\.functions\.tsx?$/,
  /\.server\.tsx?$/,
  /^routes\/api\//,
  /^integrations\/supabase\/client\.server\.ts$/,
  /^integrations\/supabase\/adminContainment\.test\.ts$/, // this file
  /^integrations\/supabase\/ADMIN_CLIENT_BOUNDARIES\.md$/,
];

const IMPORT_RE =
  /from\s+["']([^"']*\/?integrations\/supabase\/client\.server)["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("supabaseAdmin containment", () => {
  it("is only imported from approved server-only paths", () => {
    const violations: string[] = [];

    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file).replaceAll("\\", "/");
      const src = readFileSync(file, "utf8");
      if (!IMPORT_RE.test(src)) continue;
      const allowed = ALLOWED_PATTERNS.some((re) => re.test(rel));
      if (!allowed) violations.push(rel);
    }

    expect(
      violations,
      `supabaseAdmin imported from disallowed path(s):\n  ${violations.join(
        "\n  ",
      )}\nSee src/integrations/supabase/ADMIN_CLIENT_BOUNDARIES.md`,
    ).toEqual([]);
  });

  it("client-side supabase entry never re-exports the admin client", () => {
    const client = readFileSync(
      join(ROOT, "integrations/supabase/client.ts"),
      "utf8",
    );
    expect(client).not.toMatch(/client\.server/);
    expect(client).not.toMatch(/SERVICE_ROLE/);
  });
});
