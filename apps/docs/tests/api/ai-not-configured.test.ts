// Without AI_GATEWAY_API_KEY every AI route answers 503 AI_NOT_CONFIGURED
// before it looks up the session, reads the body or calls anything, even
// with a Google key set (AI runs only through the gateway). POST /v1/art and
// the MCP generate_ai_art tool answer it before they look up the API key.
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => {
  delete process.env.AI_GATEWAY_API_KEY;
  process.env.GOOGLE_API_KEY = "test-google-key";
  return { session: 0, keys: 0 };
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
    limit: async (key: string) => {
      // The MCP endpoint's own per-IP limit runs before any tool.
      if (key.startsWith("mcp:ip:")) {
        return {
          success: true,
          limit: 120,
          remaining: 119,
          reset: Date.now() + 60_000,
          pending: Promise.resolve(),
        };
      }
      throw new Error("Rate limits must not run with AI off");
    },
  }),
}));
vi.mock("@/lib/api-keys/service", () => ({
  authenticateApiKey: async () => {
    calls.keys++;
    throw new Error("The API key must not be looked up with AI off");
  },
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
  "/api/v1/art": await import("@/app/api/v1/art/route"),
  "/api/ai/art/describe": await import("@/app/api/ai/art/describe/route"),
};
const mcp = await import("@/app/api/mcp/route");
const KEY = `qrdx_${"a".repeat(40)}`;

describe("AI routes without AI_GATEWAY_API_KEY", () => {
  it.each(Object.keys(routes) as (keyof typeof routes)[])(
    "POST %s answers 503 AI_NOT_CONFIGURED",
    async (path) => {
      const response = await routes[path].POST(
        new NextRequest(`http://localhost${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${KEY}`,
          },
          body: JSON.stringify({
            text: "https://qrdx.dev",
            prompt: "a garden",
          }),
        }),
      );
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe("AI_NOT_CONFIGURED");
      expect(calls.session).toBe(0);
      expect(calls.keys).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("the MCP tool generate_ai_art answers 503 AI_NOT_CONFIGURED", async () => {
    const response = await mcp.POST(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-06-18",
          authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "generate_ai_art",
            arguments: { text: "https://qrdx.dev", prompt: "a garden" },
          },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const json = text.startsWith("{")
      ? text
      : text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
    const { result } = JSON.parse(json);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "AI_NOT_CONFIGURED",
      status: 503,
    });
    expect(calls.keys).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
