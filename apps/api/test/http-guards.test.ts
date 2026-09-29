import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("global rate limit and /admin guard", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
    // A handler that "forgot" its own staff check — the prefix guard must still stop it.
    app.get("/admin/forgot-the-check", async () => ({ leaked: true }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("gates every /admin route on the staff session, even a handler with no check", async () => {
    for (const url of ["/admin/forgot-the-check", "/admin/dashboard", "/admin/organizations"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(401);
      expect(response.json()).toEqual({ error: { code: "unauthorized", message: "Authentication required" } });
    }
  });

  it("leaves /admin/auth/* reachable without a staff session", async () => {
    const response = await app.inject({ method: "POST", url: "/admin/auth/login", payload: {} });
    expect(response.statusCode).toBe(400);
  });

  it("applies the global limit everywhere except /health", async () => {
    const me = await app.inject({ method: "GET", url: "/auth/me" });
    expect(me.headers["x-ratelimit-limit"]).toBe("300");
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.headers["x-ratelimit-limit"]).toBeUndefined();
  });

  it("keeps the stricter auth limit and answers 429 in the standard error shape", async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "bad" } });
    }
    expect(last!.headers["x-ratelimit-limit"]).toBe("10");
    expect(last!.statusCode).toBe(429);
    expect(last!.json()).toEqual({
      error: { code: "rate_limited", message: expect.stringMatching(/^Too many requests/) },
    });
  });
});
