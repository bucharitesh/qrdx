// Scene and photo modes end to end, with a fake Vercel AI Gateway behind
// fetch and in-memory tables: scene mode's picture step (POST
// /api/ai/art/picture: signed in, an image left, rate limits and its own
// daily and monthly caps, nothing reserved, the picture sealed), the paint step with the
// sealed picture, scene mode in one request for the REST API (refunded when
// the picture leaves too little time), and photo mode's one paint call.
import { NextRequest } from "next/server";
import { decodePNGPixels, scanQRPixels } from "qrdx";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { gradientPhoto } from "../support/ai-art-images";
import { fakeDb } from "../support/fake-db";
import {
  imageModelParts,
  imageModelResult,
  installFakeGateway,
  textOnlyResult,
} from "../support/fake-gateway";

const state = vi.hoisted(() => {
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  return {
    signedIn: true,
    plan: "free" as "free" | "pro" | "business",
    /** Rate limit keys that answer "too many" */
    limited: [] as string[],
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
    limit: async (key: string) => ({
      success: !state.limited.some((prefix) => key.startsWith(prefix)),
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

const picture = await import("@/app/api/ai/art/picture/route");
const art = await import("@/app/api/ai/art/route");
const { runArt } = await import("@/lib/ai/art-run");
const { renderPaintControl } = await import("@/lib/ai/art-picture");
const { sealPicture } = await import("@/lib/ai/art-seal");

const TEXT = "https://qrdx.dev/q/Ab3dE9x";
const SECRET = process.env.BETTER_AUTH_SECRET as string;
const gateway = installFakeGateway();
afterAll(() => vi.unstubAllGlobals());

const post = (
  route: { POST: (req: NextRequest) => Promise<Response> },
  path: string,
  body: Record<string, unknown>,
) =>
  route.POST(
    new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const photo = await gradientPhoto();
const photoBytes = new Uint8Array(
  Buffer.from(photo.split(",")[1] ?? "", "base64"),
);
/** The paint call's answer: the control for the square, as it was sent. */
const painted = await renderPaintControl(TEXT);
const isTextCall = (url: string) => url.endsWith("/language-model");
/** The picture call has no input image; the paint call sends the control. */
const answerScene = () =>
  gateway.respondWith((call) =>
    isTextCall(call.url)
      ? textOnlyResult("A lighthouse on a cliff at dusk, waves below.")
      : imageModelParts(call).images.length === 0
        ? imageModelResult([photoBytes])
        : imageModelResult([painted]),
  );
const usage = () => fakeDb.rows("aiUsage");
const scans = async (imageUrl: string) => {
  const pixels = await decodePNGPixels(
    new Uint8Array(Buffer.from(imageUrl.split(",")[1] ?? "", "base64")),
  );
  return Boolean(pixels && (await scanQRPixels(pixels, TEXT)).passed);
};

beforeEach(() => {
  fakeDb.resetAll();
  gateway.reset();
  state.signedIn = true;
  state.plan = "free";
  state.limited = [];
});

describe("POST /api/ai/art/picture", () => {
  it("makes the picture, sealed, and reserves nothing", async () => {
    answerScene();
    const response = await post(picture, "/api/ai/art/picture", {
      text: TEXT,
      prompt: "a lighthouse",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.picture).toMatch(/^[A-Za-z0-9_-]+$/);
    // Nothing usable in clear text: not an image, in any encoding.
    const raw = Buffer.from(body.picture, "base64url");
    expect(raw.subarray(0, 4).toString("hex")).not.toMatch(/^89504e47|^ffd8/);
    expect(JSON.stringify(body)).not.toContain(TEXT);
    expect(body.writtenPrompt).toBeUndefined();
    expect(usage()).toHaveLength(0);
    const [call] = gateway.calls;
    expect(imageModelParts(call!).images).toHaveLength(0);
    expect(call!.body.providerOptions.openai).toMatchObject({ quality: "low" });
  });

  it("writes a missing description first and returns it", async () => {
    answerScene();
    const body = await (
      await post(picture, "/api/ai/art/picture", { text: TEXT })
    ).json();
    expect(body.writtenPrompt).toBe(
      "A lighthouse on a cliff at dusk, waves below.",
    );
    expect(gateway.calls.map((call) => call.url.split("/").pop())).toEqual([
      "language-model",
      "image-model",
    ]);
  });

  it("is signed in only", async () => {
    state.signedIn = false;
    const response = await post(picture, "/api/ai/art/picture", {
      text: TEXT,
      prompt: "a lighthouse",
    });
    expect(response.status).toBe(401);
    expect(gateway.calls).toHaveLength(0);
  });

  it("needs an image left this month, without reserving one", async () => {
    fakeDb.seed(
      "aiUsage",
      [0, 1, 2].map((i) => ({
        id: `u${i}`,
        userId: "u_alice",
        modelId: "openai/gpt-image-2",
        daysSinceEpoch: "0",
        createdAt: new Date(),
      })),
    );
    const response = await post(picture, "/api/ai/art/picture", {
      text: TEXT,
      prompt: "a lighthouse",
    });
    expect(response.status).toBe(402);
    expect(gateway.calls).toHaveLength(0);
    expect(usage()).toHaveLength(3);
  });

  it("keeps the art's rate limits and its own daily and monthly caps", async () => {
    for (const key of [
      "ai-art:user:",
      "ai-art-picture:day:",
      "ai-art-picture:month:",
    ]) {
      state.limited = [key];
      const response = await post(picture, "/api/ai/art/picture", {
        text: TEXT,
        prompt: "a lighthouse",
      });
      expect(response.status, key).toBe(429);
    }
    expect(gateway.calls).toHaveLength(0);
  });

  it("is scene mode only", async () => {
    const response = await post(picture, "/api/ai/art/picture", {
      text: TEXT,
      prompt: "a lighthouse",
      mode: "photo",
    });
    expect(response.status).toBe(400);
  });
});

describe("scene mode's paint step", () => {
  it("paints the code into the sealed picture for one credit", async () => {
    answerScene();
    const sealed = sealPicture(
      photoBytes,
      { userId: "u_alice", text: TEXT, mode: "scene" },
      SECRET,
    );
    const response = await post(art, "/api/ai/art", {
      text: TEXT,
      prompt: "a lighthouse",
      mode: "scene",
      picture: sealed,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mode).toBe("scene");
    expect(await scans(body.variant.imageUrl)).toBe(true);
    expect(usage()).toHaveLength(1);
    // One paint call, with the control and the picture's square.
    expect(gateway.calls).toHaveLength(1);
    expect(imageModelParts(gateway.calls[0]!).images).toHaveLength(2);
  });

  it("refuses a picture for other content, costing nothing", async () => {
    answerScene();
    const sealed = sealPicture(
      photoBytes,
      { userId: "u_alice", text: "https://example.com", mode: "scene" },
      SECRET,
    );
    const response = await post(art, "/api/ai/art", {
      text: TEXT,
      prompt: "a lighthouse",
      mode: "scene",
      picture: sealed,
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("AI_ART_PICTURE_INVALID");
    expect(gateway.calls).toHaveLength(0);
    expect(usage()).toHaveLength(0);
  });

  it("takes a sealed picture in scene mode only", async () => {
    const response = await post(art, "/api/ai/art", {
      text: TEXT,
      prompt: "a lighthouse",
      picture: "abc",
    });
    expect(response.status).toBe(400);
  });
});

describe("scene mode in one request (the REST API and MCP)", () => {
  const scope = { userId: "u_alice", organizationId: null };
  const req = () => new Request("http://localhost/api/v1/art");

  it("makes the picture, then paints into it", async () => {
    answerScene();
    const result = await runArt({
      scope,
      request: {
        text: TEXT,
        prompt: "a lighthouse",
        mode: "scene",
        visibility: 50,
        creativity: 45,
      },
      req: req(),
      signal: new AbortController().signal,
    });
    expect(await scans(result.variant.imageUrl)).toBe(true);
    expect(
      gateway.calls.map((call) => imageModelParts(call).images.length),
    ).toEqual([0, 2]);
    expect(usage()).toHaveLength(1);
  });

  it("refunds and answers AI_ART_TIMEOUT when too little time is left to paint", async () => {
    answerScene();
    await expect(
      runArt({
        scope,
        request: {
          text: TEXT,
          prompt: "a lighthouse",
          mode: "scene",
          visibility: 50,
          creativity: 45,
        },
        req: req(),
        signal: new AbortController().signal,
        // As if 30 s had gone already: the paint wouldn't get 20 s.
        startedAt: Date.now() - 30_000,
      }),
    ).rejects.toMatchObject({ status: 504, code: "AI_ART_TIMEOUT" });
    expect(gateway.calls).toHaveLength(1);
    expect(usage()).toHaveLength(0);
  });
});

describe("photo mode", () => {
  it("paints the code into the photo in one call", async () => {
    answerScene();
    const response = await post(art, "/api/ai/art", {
      text: TEXT,
      prompt: "a gradient",
      mode: "photo",
      photo,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(await scans(body.variant.imageUrl)).toBe(true);
    expect(gateway.calls).toHaveLength(1);
    expect(usage()).toHaveLength(1);
  });
});
