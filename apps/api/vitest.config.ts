import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://fleetip:fleetip@localhost:5433/fleetip_test",
      SESSION_COOKIE_SECRET: "test-only-secret-do-not-use-in-production-00000",
      WEB_ORIGIN: "http://localhost:3000",
    },
  },
});
