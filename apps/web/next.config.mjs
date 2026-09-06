import { fileURLToPath } from "node:url";

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source (no separate build step),
  // so Next's own build pipeline needs to transpile them.
  transpilePackages: ["@fleetip/ui", "@fleetip/contracts"],
  // Pin the monorepo root explicitly — an unrelated lockfile elsewhere on
  // this machine would otherwise make Next guess the wrong workspace root.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
};

export default nextConfig;
