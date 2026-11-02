// POST /api/ai/art end to end with a fake Gemini (the AI SDK's generateImage
// is replaced) and in-memory tables: the real control image, scan check,
// Image QR blend and credit bookkeeping all run. A credit is used only for a
// delivered, scannable image; images made on fal.ai this month still count.
import { NextRequest } from "next/server";
import { decodePNGPixels, scanQRPixels } from "qrdx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { paintedArt } from "../support/ai-art-images";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  // lib/env reads the key when it's first imported.
  process.env.GOOGLE_API_KEY = "test-google-key";
  return {
    plan: "free" as "free" | "pro" | "business",
    respond: null as
      | null
      | ((call: {
          prompt: { text: string; images: Uint8Array[] };
          seed?: number;
        }) => Promise<Uint8Array>),
    calls: 0,
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
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateImage: async (options: {
    prompt: { text: string; images: Uint8Array[] };
    seed?: number;
  }) => {
    state.calls++;
    if (!state.respond) throw new Error("No fake Gemini response set");
    const data = await state.respond(options);
    const image = { uint8Array: data, mediaType: "image/png", base64: "" };
    return { image, images: [image] };
  },
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

beforeEach(() => {
  fakeDb.resetAll();
  state.plan = "free";
  state.calls = 0;
  state.respond = null;
});

describe("POST /api/ai/art", () => {
  it("delivers a scannable image and uses one credit", async () => {
    state.respond = () => paintedArt(control.png, { keep: 0.75 });
    const response = await generate();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.variant).toMatchObject({
      seed: 11,
      width: 1024,
      height: 1024,
      blended: false,
    });
    expect(body.variant.imageUrl).toMatch(/^data:image\/png;base64,/);
    expect(body.credits).toMatchObject({ limit: 3, used: 1, remaining: 2 });
    expect(usage()).toHaveLength(1);
    expect(usage()[0]?.modelId).toBe("google/gemini-nano-banana-2.1");
  });

  it("blends an image that doesn't scan, delivers it and charges for it", async () => {
    state.respond = () => paintedArt(control.png, { keep: 0.6, smear: true });
    const response = await generate({ visibility: 30 });
    expect(response.status).toBe(200);
    const { variant } = await response.json();
    expect(variant.blended).toBe(true);

    const pixels = await decodePNGPixels(
      new Uint8Array(Buffer.from(variant.imageUrl.split(",")[1], "base64")),
    );
    expect(pixels).not.toBeNull();
    expect((await scanQRPixels(pixels!, TEXT)).passed).toBe(true);
    expect(usage()).toHaveLength(1);
  });

  it("refunds the credit when Gemini fails", async () => {
    state.respond = async () => {
      throw new Error("upstream exploded");
    };
    const response = await generate();
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.code).toBe("AI_ART_FAILED");
    expect(body.message).toMatch(/No AI credit was used/);
    expect(state.calls).toBe(1);
    expect(usage()).toHaveLength(0);
  });

  it("refunds the credit when nothing readable comes back", async () => {
    state.respond = async () => new Uint8Array([0, 1, 2, 3]);
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
    state.respond = () => paintedArt(control.png, { keep: 0.75 });

    const response = await generate();
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe("SUBSCRIPTION_REQUIRED");
    expect(state.calls).toBe(0);
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
    state.respond = () => paintedArt(control.png, { keep: 0.75 });
    const response = await generate();
    expect(response.status).toBe(200);
    expect((await response.json()).credits).toMatchObject({ used: 1 });
  });
});
