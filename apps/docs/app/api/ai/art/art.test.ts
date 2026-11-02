// Run: cd apps/docs && npx tsx --conditions=react-server --test app/api/ai/art/art.test.ts
// The image pipeline with a fake art model: nothing here calls a paid service,
// and no database query runs (the 503 check happens before any).
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { APICallError, RetryError } from "ai";
import { decodePNGPixels, scanQRPixels } from "qrdx";
import {
  paintedArt,
  texturedArt,
} from "../../../../tests/support/ai-art-images";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/qrdx_test";
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;

const TEXT = "https://qrdx.dev/q/Ab3dE9x";

let art: typeof import("@/lib/ai/art");
let pipeline: typeof import("@/lib/ai/art-image");
let route: typeof import("./route");
let control: import("@/lib/ai/art-image").ControlImage;

before(async () => {
  art = await import("@/lib/ai/art");
  pipeline = await import("@/lib/ai/art-image");
  route = await import("./route");
  control = await pipeline.renderControlImage(TEXT);
});

type Call = import("@/lib/ai/art-image").ArtModelRequest;

function fakeGemini(
  respond: (call: Call) => Promise<Uint8Array> | Uint8Array,
): { model: import("@/lib/ai/art-image").ArtImageModel; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    model: async (call) => {
      calls.push(call);
      return { data: await respond(call), mediaType: "image/png" };
    },
  };
}

const request = (overrides: Record<string, unknown> = {}) => ({
  text: TEXT,
  prompt: "a zen garden",
  visibility: 50,
  creativity: 45,
  seed: 7,
  control,
  signal: new AbortController().signal,
  ...overrides,
});

const deliveredPixels = async (imageUrl: string) => {
  assert.match(imageUrl, /^data:image\/png;base64,/);
  const pixels = await decodePNGPixels(
    new Uint8Array(Buffer.from(imageUrl.split(",")[1] ?? "", "base64")),
  );
  assert.ok(pixels);
  return pixels;
};

describe("control image", () => {
  it("is a square level-H code that decodes to the content", async () => {
    const pixels = await decodePNGPixels(control.png);
    assert.equal(pixels?.width, 1024);
    assert.equal(pixels?.height, 1024);
    assert.equal(control.modules, 33);
    assert.equal((await scanQRPixels(pixels!, TEXT)).passed, true);
  });
});

describe("buildArtPrompt", () => {
  const prompt = (overrides: Record<string, unknown> = {}) =>
    pipeline.buildArtPrompt({
      prompt: "a zen garden.",
      visibility: 50,
      creativity: 45,
      withReference: false,
      ...overrides,
    });

  it("asks Gemini to keep the grid, the finder eyes and the quiet zone", () => {
    const text = prompt();
    assert.match(text, /^Repaint the QR code .*: a zen garden\.$/m);
    assert.match(text, /same grid/);
    assert.match(text, /finder patterns .* flat and crisp/);
    assert.match(text, /without fine speckles/);
    assert.match(text, /quiet zone\) plain, light/);
    assert.match(text, /No text, letters, logos/);
  });

  it("adds each art model's own rules", () => {
    assert.match(prompt(), /no perspective, depth or 3D blocks/);
    assert.match(
      prompt({ model: "openai/gpt-image-2" }),
      /Don't zoom, crop or re-center/,
    );
    assert.doesNotMatch(prompt({ model: "openai/gpt-image-2" }), /3D blocks/);
    assert.doesNotMatch(prompt({ model: "bfl/flux-kontext-pro" }), /3D|zoom/);
  });

  it("follows the sliders, the negative prompt and the reference", () => {
    assert.match(prompt({ visibility: 90 }), /Favor the code/);
    assert.match(prompt({ visibility: 10 }), /Favor the scene/);
    assert.match(prompt({ creativity: 10 }), /literally/);
    assert.match(prompt({ creativity: 90 }), /freely/);
    assert.match(prompt({ negativePrompt: "people" }), /^Avoid: people\.$/m);
    const withReference = prompt({ withReference: true });
    assert.match(withReference, /second image is a reference/);
    assert.doesNotMatch(withReference, /logos/);
  });

  it("maps QR visibility onto the blend strength (higher = clearer code)", () => {
    assert.equal(pipeline.visibilityToBlendIntensity(0), 0.9);
    assert.equal(pipeline.visibilityToBlendIntensity(100), 0.5);
    assert.equal(pipeline.visibilityToBlendIntensity(500), 0.5);
  });
});

describe("generateArtVariant (fake Gemini)", () => {
  it("delivers Gemini's image as it is when it scans", async () => {
    const restyled = await paintedArt(control.png, { keep: 0.75 });
    const { model, calls } = fakeGemini(() => restyled);
    const variant = await pipeline.generateArtVariant(request({ model }));

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.seed, 7);
    assert.equal(calls[0]?.images.length, 1);
    assert.deepEqual(calls[0]?.images[0], control.png);
    assert.match(calls[0]?.prompt ?? "", /a zen garden/);
    assert.equal(variant.blended, false);
    assert.equal(variant.blend, "none");
    assert.equal(variant.blendStrength, 0);
    assert.equal(variant.seed, 7);
    assert.equal(
      variant.imageUrl,
      `data:image/png;base64,${Buffer.from(restyled).toString("base64")}`,
    );
  });

  it("strengthens a textured image just enough to scan, on the model's own pixels", async () => {
    const textured = await texturedArt(control.png);
    const raw = (await decodePNGPixels(textured))!;
    assert.equal((await scanQRPixels(raw, TEXT)).passed, false);
    const { model } = fakeGemini(() => textured);
    const variant = await pipeline.generateArtVariant(request({ model }));

    assert.equal(variant.blended, true);
    assert.equal(variant.blend, "least");
    assert.ok(variant.blendStrength > 0 && variant.blendStrength < 1);
    const pixels = await deliveredPixels(variant.imageUrl);
    assert.equal((await scanQRPixels(pixels, TEXT)).passed, true);
    // The scene far outside the code is the model's, pixel for pixel.
    assert.deepEqual(
      [...pixels.data.subarray(0, 4)],
      [...raw.data.subarray(0, 4)],
    );
  });

  it("still delivers an image that needs more, as Image QR at QR visibility 50", async () => {
    const broken = await paintedArt(control.png, { keep: 0.6, smear: true });
    assert.equal(
      (await scanQRPixels((await decodePNGPixels(broken))!, TEXT)).passed,
      false,
    );
    const { model } = fakeGemini(() => broken);
    const variant = await pipeline.generateArtVariant(request({ model }));

    assert.equal(variant.blended, true);
    assert.ok(["least", "image-qr"].includes(variant.blend));
    assert.ok(variant.blendStrength > 0);
    const pixels = await deliveredPixels(variant.imageUrl);
    assert.equal(pixels.width, 1024);
    assert.equal((await scanQRPixels(pixels, TEXT)).passed, true);
  });

  it("strengthens even a scannable image at high QR visibility", async () => {
    const restyled = await paintedArt(control.png, { keep: 0.75 });
    const { model } = fakeGemini(() => restyled);
    const variant = await pipeline.generateArtVariant(
      request({ model, visibility: 100 }),
    );
    assert.equal(variant.blend, "least");
    assert.ok(variant.blendStrength >= 0.6);
    const pixels = await deliveredPixels(variant.imageUrl);
    assert.equal((await scanQRPixels(pixels, TEXT)).passed, true);
  });

  it("delivers nothing at low QR visibility rather than cover the scene", async () => {
    // Needs a strength of about 0.65; QR visibility 0 stops at 0.6.
    const heavy = await texturedArt(control.png, { speckle: 200 });
    const { model } = fakeGemini(() => heavy);
    await assert.rejects(
      pipeline.generateArtVariant(request({ model, visibility: 0 })),
      (error: { status?: number; code?: string; message?: string }) =>
        error.status === 502 &&
        error.code === "AI_ART_UNSCANNABLE" &&
        /raise QR visibility/.test(error.message ?? ""),
    );
  });

  it("sends a reference image second", async () => {
    const { model, calls } = fakeGemini(() => control.png);
    const reference = `data:image/png;base64,${Buffer.from(control.png).toString("base64")}`;
    await pipeline.generateArtVariant(request({ model, reference }));
    assert.equal(calls[0]?.images.length, 2);
    assert.match(calls[0]?.prompt ?? "", /second image is a reference/);
  });

  it("says no credit was used when Gemini fails", async () => {
    const { model } = fakeGemini(() => {
      throw new Error("upstream exploded");
    });
    await assert.rejects(
      pipeline.generateArtVariant(request({ model })),
      (error: { status?: number; code?: string; message?: string }) =>
        error.status === 502 &&
        error.code === "AI_ART_FAILED" &&
        /No AI credit was used/.test(error.message ?? ""),
    );
  });

  it("turns a quota error into a retryable 503, also after the SDK's retry", async () => {
    const quota = new APICallError({
      message: "Resource exhausted",
      url: "https://generativelanguage.googleapis.com",
      requestBodyValues: {},
      statusCode: 429,
    });
    for (const thrown of [
      quota,
      new RetryError({
        message: "Failed after 2 attempts",
        reason: "maxRetriesExceeded",
        errors: [quota, quota],
      }),
    ]) {
      const { model } = fakeGemini(() => {
        throw thrown;
      });
      await assert.rejects(
        pipeline.generateArtVariant(request({ model })),
        (error: { status?: number; code?: string; message?: string }) =>
          error.status === 503 &&
          error.code === "AI_ART_BUSY" &&
          /No AI credit was used/.test(error.message ?? ""),
      );
    }
  });

  it("rejects an image it can't read", async () => {
    const { model } = fakeGemini(() => new Uint8Array([1, 2, 3, 4]));
    await assert.rejects(
      pipeline.generateArtVariant(request({ model })),
      (error: { status?: number; message?: string }) =>
        error.status === 502 &&
        /No AI credit was used/.test(error.message ?? ""),
    );
  });

  it("gives up on a slow model, saying no credit was used", async () => {
    const { model } = fakeGemini(
      (call) =>
        new Promise((_, reject) => {
          // AbortSignal.timeout doesn't keep the process alive; this does.
          const pending = setTimeout(() => {}, 5000);
          call.abortSignal.addEventListener("abort", () => {
            clearTimeout(pending);
            reject(call.abortSignal.reason);
          });
        }),
    );
    await assert.rejects(
      pipeline.generateArtVariant(request({ model, timeoutMs: 50 })),
      (error: { status?: number; code?: string; message?: string }) =>
        error.status === 504 &&
        error.code === "AI_ART_TIMEOUT" &&
        /No AI credit was used/.test(error.message ?? ""),
    );
  });

  it("passes a cancelled request through untouched", async () => {
    const controller = new AbortController();
    const { model } = fakeGemini(() => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await assert.rejects(
      pipeline.generateArtVariant(
        request({ model, signal: controller.signal }),
      ),
      (error: { name?: string }) => error.name === "AbortError",
    );
  });
});

describe("credits", () => {
  it("still count this month's fal.ai images", () => {
    assert.ok(art.ART_USAGE_MODEL_IDS.includes(art.ART_MODEL_ID));
    for (const id of ["fal-ai/illusion-diffusion", "fal-ai/esrgan"]) {
      assert.ok(art.ART_USAGE_MODEL_IDS.includes(id), id);
    }
  });

  it("use the UTC calendar month", () => {
    const { start, resetsAt } = art.artCreditWindow(
      new Date("2026-12-31T23:30:00Z"),
    );
    assert.equal(start.toISOString(), "2026-12-01T00:00:00.000Z");
    assert.equal(resetsAt.toISOString(), "2027-01-01T00:00:00.000Z");
  });
});

describe("route without AI_GATEWAY_API_KEY", () => {
  it("POST /api/ai/art answers 503 AI_NOT_CONFIGURED", async () => {
    const response = await route.POST(
      new Request("http://localhost/api/ai/art", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "https://qrdx.dev", prompt: "a garden" }),
      }) as unknown as import("next/server").NextRequest,
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "AI_NOT_CONFIGURED");
  });
});
