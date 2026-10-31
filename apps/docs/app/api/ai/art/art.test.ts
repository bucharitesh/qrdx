// Run: cd apps/docs && npx tsx --conditions=react-server --test app/api/ai/art/art.test.ts
// fal.ai is mocked and FAL_KEY is unset: nothing here calls a paid service,
// and no database query runs (the 503 check happens before any).
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/qrdx_test";
delete process.env.FAL_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;

let art: typeof import("@/lib/ai/art");
let route: typeof import("./route");
let upscaleRoute: typeof import("./upscale/route");

before(async () => {
  art = await import("@/lib/ai/art");
  route = await import("./route");
  upscaleRoute = await import("./upscale/route");
});

type SubscribeCall = { modelId: string; input: Record<string, unknown> };

function fakeFal(
  respond: (call: SubscribeCall) => Promise<unknown> | unknown,
): { fal: import("@/lib/ai/art").ArtFalClient; calls: SubscribeCall[] } {
  const calls: SubscribeCall[] = [];
  const fal = {
    subscribe: async (
      modelId: string,
      options: { input: Record<string, unknown> },
    ) => {
      const call = { modelId, input: options.input };
      calls.push(call);
      return { data: await respond(call), requestId: "req_1" };
    },
    queue: { cancel: async () => undefined },
  } as unknown as import("@/lib/ai/art").ArtFalClient;
  return { fal, calls };
}

const generated = (seed: number) => ({
  image: {
    url: `https://v3.fal.media/files/test/${seed}.png`,
    width: 1024,
    height: 1024,
  },
  seed,
});

describe("runArtVariants (mocked fal)", () => {
  it("runs one call per seed with the mapped model inputs", async () => {
    const { fal, calls } = fakeFal(({ input }) =>
      generated(input.seed as number),
    );
    const outcomes = await art.runArtVariants({
      controlImage: "data:image/png;base64,AAAA",
      prompt: "a zen garden",
      negativePrompt: "people",
      visibility: 100,
      creativity: 0,
      seeds: [7, 8, 9],
      signal: new AbortController().signal,
      fal,
    });

    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.modelId, art.ART_MODEL_ID);
      assert.equal(call.input.image_url, "data:image/png;base64,AAAA");
      assert.equal(call.input.controlnet_conditioning_scale, 2);
      assert.equal(call.input.guidance_scale, 12);
      assert.match(String(call.input.negative_prompt), /, people$/);
      assert.match(String(call.input.negative_prompt), /^ugly/);
    }
    assert.deepEqual(
      calls.map((call) => call.input.seed),
      [7, 8, 9],
    );
    assert.deepEqual(
      outcomes.map((outcome) => outcome.ok && outcome.variant.seed),
      [7, 8, 9],
    );
  });

  it("reports failed variants separately so they can be refunded", async () => {
    const { fal } = fakeFal(({ input }) => {
      if (input.seed === 2) throw new Error("GPU exploded");
      if (input.seed === 3) return { image: {} };
      return generated(input.seed as number);
    });
    const outcomes = await art.runArtVariants({
      controlImage: "data:image/png;base64,AAAA",
      prompt: "a zen garden",
      visibility: 50,
      creativity: 50,
      seeds: [1, 2, 3],
      signal: new AbortController().signal,
      fal,
    });
    assert.deepEqual(
      outcomes.map((outcome) => outcome.ok),
      [true, false, false],
    );
    const failure = outcomes[1];
    assert.ok(failure && !failure.ok);
    assert.equal((failure.error as { status?: number }).status, 502);
  });

  it("rejects more than four variations", async () => {
    const { fal } = fakeFal(() => generated(1));
    await assert.rejects(
      art.runArtVariants({
        controlImage: "data:image/png;base64,AAAA",
        prompt: "a zen garden",
        visibility: 50,
        creativity: 50,
        seeds: [1, 2, 3, 4, 5],
        signal: new AbortController().signal,
        fal,
      }),
      RangeError,
    );
  });
});

describe("upscaleArtImage (mocked fal)", () => {
  it("asks Real-ESRGAN for 2× with the x2 weights", async () => {
    const { fal, calls } = fakeFal(() => ({
      image: {
        url: "https://v3.fal.media/files/test/up.png",
        width: 2048,
        height: 2048,
      },
    }));
    const image = await art.upscaleArtImage({
      imageUrl: "https://v3.fal.media/files/test/1.png",
      signal: new AbortController().signal,
      fal,
    });
    assert.equal(calls[0]?.modelId, art.ART_UPSCALE_MODEL_ID);
    assert.equal(calls[0]?.input.scale, 2);
    assert.equal(calls[0]?.input.model, "RealESRGAN_x2plus");
    assert.equal(image.width, 2048);
  });

  it("never sends other URLs to the upscaler", async () => {
    const { fal, calls } = fakeFal(() => generated(1));
    await assert.rejects(
      art.upscaleArtImage({
        imageUrl: "https://example.com/photo.png",
        signal: new AbortController().signal,
        fal,
      }),
      (error: { status?: number }) => error.status === 400,
    );
    assert.equal(calls.length, 0);
  });
});

describe("artCreditWindow", () => {
  it("is the UTC calendar month", () => {
    const { start, resetsAt } = art.artCreditWindow(
      new Date("2026-12-31T23:30:00Z"),
    );
    assert.equal(start.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(resetsAt.toISOString(), "2027-01-01T00:00:00.000Z");
  });
});

describe("routes without FAL_KEY", () => {
  const post = (path: string, body: unknown) =>
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as import("next/server").NextRequest;

  it("POST /api/ai/art answers 503 AI_NOT_CONFIGURED", async () => {
    const response = await route.POST(
      post("/api/ai/art", { text: "https://qrdx.dev", prompt: "a garden" }),
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "AI_NOT_CONFIGURED");
  });

  it("POST /api/ai/art/upscale answers 503 AI_NOT_CONFIGURED", async () => {
    const response = await upscaleRoute.POST(
      post("/api/ai/art/upscale", {
        imageUrl: "https://v3.fal.media/files/x.png",
      }),
    );
    assert.equal(response.status, 503);
  });
});
