// POST /api/ai/art/describe ("Write one for me") with a fake Vercel AI
// Gateway behind fetch: the app's real gateway client builds each request.
// Signed-in only, rate limited per user, per IP and per day, validated like
// the art route, and never an art credit.
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";
import {
  gatewayError,
  installFakeGateway,
  textOnlyResult,
  userParts,
} from "../support/fake-gateway";

const state = vi.hoisted(() => {
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  return {
    signedIn: true,
    /** Rate limit keys that answer "blocked" */
    blocked: [] as string[],
    checked: [] as string[],
  };
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
      getSession: async () =>
        state.signedIn
          ? {
              user: { id: "u_alice" },
              session: { activeOrganizationId: null },
            }
          : null,
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async (key: string) => {
      state.checked.push(key);
      const blocked = state.blocked.some((prefix) => key.startsWith(prefix));
      return {
        success: !blocked,
        limit: 60,
        remaining: blocked ? 0 : 59,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      };
    },
  }),
}));

const { POST } = await import("@/app/api/ai/art/describe/route");
const gateway = installFakeGateway();
afterAll(() => {
  vi.unstubAllGlobals();
});

const describeArt = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("http://localhost/api/ai/art/describe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "203.0.113.7",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const photoDataUrl = async () => {
  const png = await sharp({
    create: { width: 800, height: 500, channels: 3, background: "#c2410c" },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
};

beforeEach(() => {
  fakeDb.resetAll();
  gateway.reset();
  state.signedIn = true;
  state.blocked = [];
  state.checked = [];
});

describe("POST /api/ai/art/describe", () => {
  it("writes a description with Claude Haiku through Anthropic only, and uses no credit", async () => {
    gateway.respondWith(() =>
      textOnlyResult('"A misty bamboo forest at dawn, soft green light."'),
    );
    const response = await describeArt({
      mode: "code",
      style: "ink",
      hint: "bamboo",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      prompt: "A misty bamboo forest at dawn, soft green light.",
    });

    expect(gateway.calls).toHaveLength(1);
    const [call] = gateway.calls;
    expect(call?.url).toBe("https://ai-gateway.vercel.sh/v4/ai/language-model");
    expect(call?.headers["ai-language-model-id"]).toBe(
      "anthropic/claude-haiku-5.5",
    );
    expect(call?.body.providerOptions).toEqual({
      gateway: { disallowPromptTraining: true, only: ["anthropic"] },
    });
    expect(call?.body.maxOutputTokens).toBeLessThanOrEqual(150);
    const { text, images } = userParts(call!);
    expect(text).toMatch(/"Ink"/);
    expect(text).toMatch(/bamboo/);
    expect(images).toHaveLength(0);
    expect(fakeDb.rows("aiUsage")).toHaveLength(0);
  });

  it("sends the photo downscaled, as a JPEG, in photo mode", async () => {
    gateway.respondWith(() => textOnlyResult("An orange wall in warm light."));
    const response = await describeArt({
      mode: "photo",
      photo: await photoDataUrl(),
    });
    expect(response.status).toBe(200);
    const { images } = userParts(gateway.calls[0]!);
    expect(images).toHaveLength(1);
    expect(images[0]?.mediaType).toBe("image/jpeg");
    const meta = await sharp(images[0]!.bytes).metadata();
    expect(meta.width).toBe(384);
  });

  it("needs a signed-in user", async () => {
    state.signedIn = false;
    const response = await describeArt({});
    expect(response.status).toBe(401);
    expect(gateway.calls).toHaveLength(0);
  });

  it("rate limits per user, per IP and per day before reading the request", async () => {
    gateway.respondWith(() => textOnlyResult("A quiet harbor at dusk."));
    expect((await describeArt({})).status).toBe(200);
    expect(state.checked).toEqual([
      "ai-art-describe:user:u_alice",
      "ai-art-describe:ip:203.0.113.7",
      "ai-art-describe:day:u_alice",
    ]);

    for (const blocked of [
      "ai-art-describe:user:",
      "ai-art-describe:ip:",
      "ai-art-describe:day:",
    ]) {
      state.blocked = [blocked];
      gateway.reset();
      const response = await describeArt({ style: "not-a-look" });
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBeTruthy();
      expect(gateway.calls).toHaveLength(0);
    }
  });

  it("validates the request like the art route", async () => {
    const cases: [unknown, number][] = [
      [{ style: "sepia" }, 400],
      [{ mode: "photo" }, 400],
      [{ photo: await photoDataUrl() }, 400],
      [{ mode: "photo", photo: "https://example.com/me.png" }, 400],
      [{ hint: "x".repeat(401) }, 400],
      ["not json", 400],
      [{ hint: "x".repeat(2_000_000) }, 413],
    ];
    for (const [body, status] of cases) {
      const response = await describeArt(body);
      expect(response.status, JSON.stringify(body).slice(0, 60)).toBe(status);
    }
    expect(gateway.calls).toHaveLength(0);
  });

  it("explains a failed model call without an art credit", async () => {
    gateway.respondWith(() => gatewayError(500, "internal_server_error"));
    const response = await describeArt({});
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("AI_ART_DESCRIBE_FAILED");
    expect(fakeDb.rows("aiUsage")).toHaveLength(0);
  });
});
