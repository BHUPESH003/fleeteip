import { build } from "esbuild";

// Bundles the API into one runnable file. Real npm dependencies stay external
// (installed at runtime); internal workspace packages (e.g. @fleetip/contracts)
// ship TypeScript source with no dist of their own, so esbuild inlines them here
// instead of every internal package needing its own build step.
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  platform: "node",
  format: "esm",
  target: "node22",
  bundle: true,
  sourcemap: true,
  external: [
    "fastify",
    "@fastify/cookie",
    "@fastify/cors",
    "pg",
    "kysely",
    "pino",
    "pino-pretty",
    "zod",
  ],
});
