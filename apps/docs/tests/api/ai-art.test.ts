// POST /api/ai/art end to end with a fake Vercel AI Gateway behind fetch (the
// app's real gateway client builds every request) and in-memory tables: the
// real control image, scan check, blend and credit bookkeeping all run. A
// credit is used only for a delivered, scannable image; images made this
// month with earlier art models (Nano Banana 2.1, fal.ai) still count.
import { NextRequest } from "next/server";
import { decodePNGPixels, scanQRPixels } from "qrdx";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { paintedArt } from "../support/ai-art-images";
import { fakeDb } from "../support/fake-db";
import {
  gatewayError,
  imageModelParts,
  imageModelResult,
  installFakeGateway,
} from "../support/fake-gateway";

const state = vi.hoisted(() => {
  // lib/env reads the key when it's first imported. A Google key does
  // nothing any more: AI runs only through the gateway.
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  process.env.GOOGLE_API_KEY = "test-google-key";
  return { plan: "free" as "free" | "pro" | "business" };
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
      getSession: async () => ({
        user: { id: "u_alice" },
        session: { activeOrganizationId: null },
      }),
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));

const { POST } = await import("@/app/api/ai/art/route");
const credits = await import("@/app/api/ai/art/credits/route");
const { renderControlImage } = await import("@/lib/ai/art-image");

const TEXT = "https://qrdx.dev/q/Ab3dE9x";
const control = await renderControlImage(TEXT);

const generate = (body: Record<string, unknown> = {}) =>
  POST(
    new NextRequest("http://localhost/api/ai/art", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: TEXT,
        prompt: "a zen garden",
        seed: 11,
        ...body,
      }),
    }),
  );

const usage = () => fakeDb.rows("aiUsage");
const thisMonth = new Date();
const gateway = installFakeGateway();
afterAll(() => {
  vi.unstubAllGlobals();
});

/** Answers every model call with an image made from the control code. */
const respondWithArt = (art: () => Promise<Uint8Array>) =>
  gateway.respondWith(async () => imageModelResult([await art()]));

const usageRow = (
  id: string,
  userId: string,
  modelId: string,
  createdAt = thisMonth,
) => ({
  id,
  userId,
  modelId,
  daysSinceEpoch: "0",
  createdAt,
});

const allowance = async () =>
  (
    await (
      await credits.GET(new NextRequest("http://localhost/api/ai/art/credits"))
    ).json()
  ).credits;

beforeEach(() => {
  fakeDb.resetAll();
  state.plan = "free";
  gateway.reset();
});

describe("POST /api/ai/art", () => {
  it("delivers a scannable image and uses one credit", async () => {
    respondWithArt(() => paintedArt(control.png, { keep: 0.75 }));
    const response = await generate();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.variant).toMatchObject({
      seed: 11,
      width: 1024,
      height: 1024,
      blended: false,
      blend: "none",
      blendStrength: 0,
    });
    expect(body.variant.imageUrl).toMatch(/^data:image\/png;base64,/);
    expect(body.credits).toMatchObject({ limit: 3, used: 1, remaining: 2 });
    expect(usage()).toHaveLength(1);
    expect(usage()[0]?.modelId).toBe("openai/gpt-image-2");
  });

  it("blends an image that doesn't scan, delivers it and charges for it", async () => {
    respondWithArt(() => paintedArt(control.png, { keep: 0.6, smear: true }));
    const response = await generate({ visibility: 30 });
    expect(response.status).toBe(200);
    const { variant } = await response.json();
    expect(variant.blended).toBe(true);
    expect(["least", "image-qr"]).toContain(variant.blend);
    expect(variant.blendStrength).toBeGreaterThan(0);

    const pixels = await decodePNGPixels(
      new Uint8Array(Buffer.from(variant.imageUrl.split(",")[1], "base64")),
    );
    expect(pixels).not.toBeNull();
    expect((await scanQRPixels(pixels!, TEXT)).passed).toBe(true);
    expect(usage()).toHaveLength(1);
  });

  it("refunds the credit when the model fails, after one retry", async () => {
    gateway.respondWith(() =>
      gatewayError(500, "internal_server_error", "upstream exploded"),
    );
    const response = await generate();
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.code).toBe("AI_ART_FAILED");
    expect(body.message).toMatch(/No AI credit was used/);
    expect(gateway.calls).toHaveLength(2);
    expect(usage()).toHaveLength(0);
  });

  it("refunds the credit when nothing readable comes back", async () => {
    respondWithArt(async () => new Uint8Array([0, 1, 2, 3]));
    const response = await generate();
    expect(response.status).toBe(502);
    expect((await response.json()).message).toMatch(/No AI credit was used/);
    expect(usage()).toHaveLength(0);
  });

  it("counts this month's fal.ai images against the allowance", async () => {
    fakeDb.seed("aiUsage", [
      ...["fal-ai/illusion-diffusion", "fal-ai/illusion-diffusion"].map(
        (modelId, i) => ({
          id: `old_${i}`,
          userId: "u_alice",
          modelId,
          daysSinceEpoch: "0",
          createdAt: thisMonth,
        }),
      ),
      {
        id: "old_up",
        userId: "u_alice",
        modelId: "fal-ai/esrgan",
        daysSinceEpoch: "0",
        createdAt: thisMonth,
      },
    ]);
    respondWithArt(() => paintedArt(control.png, { keep: 0.75 }));

    const response = await generate();
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe("SUBSCRIPTION_REQUIRED");
    expect(gateway.calls).toHaveLength(0);
    expect(usage()).toHaveLength(3);

    const allowance = await credits.GET(
      new NextRequest("http://localhost/api/ai/art/credits"),
    );
    expect((await allowance.json()).credits).toMatchObject({
      limit: 3,
      used: 3,
      remaining: 0,
    });
  });

  it("counts this month's Nano Banana 2.1 images with GPT Image 2's in one allowance", async () => {
    fakeDb.seed("aiUsage", [
      usageRow("nano_1", "u_alice", "google/gemini-nano-banana-2.1"),
      usageRow("nano_2", "u_alice", "google/gemini-nano-banana-2.1"),
      // Last month's don't count.
      usageRow(
        "nano_old",
        "u_alice",
        "google/gemini-nano-banana-2.1",
        new Date("2020-01-15T00:00:00Z"),
      ),
    ]);
    respondWithArt(() => paintedArt(control.png, { keep: 0.75 }));

    const response = await generate();
    expect(response.status).toBe(200);
    expect((await response.json()).credits).toMatchObject({
      limit: 3,
      used: 3,
      remaining: 0,
    });
    expect(
      usage().filter((row) => row.modelId === "openai/gpt-image-2"),
    ).toHaveLength(1);

    // The allowance is used up: the next run is refused before any call.
    gateway.reset();
    respondWithArt(() => paintedArt(control.png, { keep: 0.75 }));
    expect((await generate()).status).toBe(402);
    expect(gateway.calls).toHaveLength(0);
  });

  it("pools a Business workspace's images across its members and both models", async () => {
    state.plan = "business";
    // The first look creates Alice's own workspace.
    expect(await allowance()).toMatchObject({ used: 0, pooled: true });
    const workspaceId = fakeDb.find("member", {
      userId: "u_alice",
    })?.organizationId;
    expect(workspaceId).toBeDefined();
    fakeDb.seed("member", [
      {
        id: "m_bob",
        userId: "u_bob",
        organizationId: workspaceId,
        role: "member",
        createdAt: thisMonth,
      },
    ]);
    fakeDb.seed("aiUsage", [
      usageRow("bob_nano", "u_bob", "google/gemini-nano-banana-2.1"),
      usageRow("bob_gpt", "u_bob", "openai/gpt-image-2"),
      usageRow("alice_nano", "u_alice", "google/gemini-nano-banana-2.1"),
      // Someone outside the workspace, and a theme request: neither counts.
      usageRow("carol_gpt", "u_carol", "openai/gpt-image-2"),
      usageRow("alice_theme", "u_alice", "anthropic/claude-haiku-5.5"),
    ]);
    expect(await allowance()).toMatchObject({
      plan: "business",
      limit: 150,
      used: 3,
      remaining: 147,
      pooled: true,
    });

    respondWithArt(() => paintedArt(control.png, { keep: 0.75 }));
    const response = await generate();
    expect(response.status).toBe(200);
    expect((await response.json()).credits).toMatchObject({ used: 4 });
  });

  it("ignores fal.ai images from earlier months", async () => {
    fakeDb.seed(
      "aiUsage",
      [0, 1, 2].map((i) => ({
        id: `old_${i}`,
        userId: "u_alice",
        modelId: "fal-ai/illusion-diffusion",
        daysSinceEpoch: "0",
        createdAt: new Date("2020-01-15T00:00:00Z"),
      })),
    );
    respondWithArt(() => paintedArt(control.png, { keep: 0.75 }));
    const response = await generate();
    expect(response.status).toBe(200);
    expect((await response.json()).credits).toMatchObject({ used: 1 });
  });
});

describe("the art request through Vercel AI Gateway", () => {
  it("sends the prompt and control code to GPT Image 2, OpenAI only, untrained, without a seed", async () => {
    respondWithArt(() => paintedArt(control.png, { keep: 0.75 }));
    expect((await generate()).status).toBe(200);

    expect(gateway.calls).toHaveLength(1);
    const [call] = gateway.calls;
    expect(call?.url).toBe("https://ai-gateway.vercel.sh/v4/ai/image-model");
    expect(call?.headers).toMatchObject({
      authorization: "Bearer test-gateway-key",
      "ai-gateway-auth-method": "api-key",
      "ai-model-id": "openai/gpt-image-2",
      "ai-image-model-specification-version": "4",
    });
    expect(call?.body).toMatchObject({ n: 1, size: "1024x1024" });
    // GPT Image 2 ignores seeds, so none is sent.
    expect(call?.body.seed).toBeUndefined();
    expect(call?.body.providerOptions).toEqual({
      gateway: { disallowPromptTraining: true, only: ["openai"] },
    });
    const { text, images } = imageModelParts(call!);
    expect(text).toMatch(
      /^Repaint the QR code in the first image as artwork: a zen garden\./,
    );
    expect(text).toMatch(/Don't zoom, crop or re-center/);
    expect(images).toHaveLength(1);
    expect(Buffer.from(images[0]!.bytes).equals(Buffer.from(control.png))).toBe(
      true,
    );
  });

  it("sends a reference image second", async () => {
    respondWithArt(() => paintedArt(control.png, { keep: 0.75 }));
    const reference = `data:image/png;base64,${Buffer.from(control.png).toString("base64")}`;
    expect((await generate({ reference })).status).toBe(200);
    const { text, images } = imageModelParts(gateway.calls[0]!);
    expect(images).toHaveLength(2);
    expect(text).toMatch(/The second image is a reference/);
  });

  it("answers a rejected key with AI_ART_FAILED and no retry", async () => {
    gateway.respondWith(() =>
      gatewayError(401, "authentication_error", "Authentication failed."),
    );
    const response = await generate();
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("AI_ART_FAILED");
    expect(gateway.calls).toHaveLength(1);
    expect(usage()).toHaveLength(0);
  });

  it("says AI art is busy when the gateway rate limits twice", async () => {
    gateway.respondWith(() => gatewayError(429, "rate_limit_exceeded"));
    const response = await generate();
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("AI_ART_BUSY");
    expect(gateway.calls).toHaveLength(2);
    expect(usage()).toHaveLength(0);
  });

  it("explains a reply without an image as a declined prompt", async () => {
    gateway.respondWith(() => imageModelResult([]));
    const response = await generate();
    expect(response.status).toBe(502);
    expect((await response.json()).message).toMatch(/returned no image/);
    expect(usage()).toHaveLength(0);
  });
});
