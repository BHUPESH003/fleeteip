import { defineConfig } from "vitest/config";

// Pure-logic tests only (no DOM): lib helpers, schemas, maps.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
