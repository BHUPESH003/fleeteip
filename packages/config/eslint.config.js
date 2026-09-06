import tseslint from "typescript-eslint";

/** Shared ESLint flat config. Consumers spread this and add their own `files`/overrides. */
export const baseConfig = tseslint.config(
  {
    // public_html is the legacy PHP app (reference material only, not part of this
    // codebase) — never lint it. The rest are ordinary build/output directories,
    // matched at any depth since apps/packages nest them below the repo root.
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/next-env.d.ts",
      "public_html/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);

export default baseConfig;
