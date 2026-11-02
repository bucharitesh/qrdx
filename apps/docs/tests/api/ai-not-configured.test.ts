// Without AI_GATEWAY_API_KEY every AI route answers 503 AI_NOT_CONFIGURED
// before it looks up the session, reads the body or calls anything, even
// with a Google key set (AI runs only through the gateway).
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => {
  delete process.env.AI_GATEWAY_API_KEY;
  process.env.GOOGLE_API_KEY = "test-google-key";
  return { session: 0 };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => {
        calls.session++;
        throw new Error("The session must not be read with AI off");
      },
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => {
      throw new Error("Rate limits must not run with AI off");
    },
  }),
}));

const fetchSpy = vi.fn(async () => {
  throw new Error("No network with AI off");
});
vi.stubGlobal("fetch", fetchSpy);
afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_API_KEY;
});

const routes = {
  "/api/enhance-prompt": await import("@/app/api/enhance-prompt/route"),
  "/api/generate-qr-theme": await import("@/app/api/generate-qr-theme/route"),
  "/api/ai/art": await import("@/app/api/ai/art/route"),
};

describe("AI routes without AI_GATEWAY_API_KEY", () => {
  it.each(Object.keys(routes) as (keyof typeof routes)[])(
    "POST %s answers 503 AI_NOT_CONFIGURED",
    async (path) => {
      const response = await routes[path].POST(
        new NextRequest(`http://localhost${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: "https://qrdx.dev",
            prompt: "a garden",
          }),
        }),
      );
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe("AI_NOT_CONFIGURED");
      expect(calls.session).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});
