import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Architectural containment rule: `supabaseAdmin` (service-role client)
 * bypasses RLS and MUST only be imported from approved server-only paths:
 *
 *   - `src/**\/*.functions.ts(x)`           — TanStack `createServerFn` modules
 *   - `src/**\/*.server.ts(x)`              — server-only helpers (.server suffix
 *                                            is enforced by the import-protection
 *                                            plugin)
 *   - `src/routes/api/**`                  — server route handlers (webhooks,
 *                                            public APIs, cron callbacks)
 *   - `src/integrations/supabase/client.server.ts` — the module itself
 *
 * Importing it from anywhere else (components, hooks, shared utils, route
 * files that ship to the client, .test.ts files) is a CI-failing error.
 */
const restrictedAdminImport = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        {
          name: "@/integrations/supabase/client.server",
          message:
            "supabaseAdmin bypasses RLS — only import from *.functions.ts, *.server.ts, or src/routes/api/**. See src/integrations/supabase/ADMIN_CLIENT_BOUNDARIES.md.",
        },
      ],
      patterns: [
        {
          group: [
            "**/integrations/supabase/client.server",
            "**/integrations/supabase/client.server.*",
          ],
          message:
            "supabaseAdmin bypasses RLS — only import from *.functions.ts, *.server.ts, or src/routes/api/**. See src/integrations/supabase/ADMIN_CLIENT_BOUNDARIES.md.",
        },
      ],
    },
  ],
};

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      ...restrictedAdminImport,
    },
  },
  // Allow supabaseAdmin import only from approved server-only paths.
  {
    files: [
      "src/**/*.functions.ts",
      "src/**/*.functions.tsx",
      "src/**/*.server.ts",
      "src/**/*.server.tsx",
      "src/routes/api/**/*.ts",
      "src/routes/api/**/*.tsx",
      "src/integrations/supabase/client.server.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  eslintPluginPrettier,
);
