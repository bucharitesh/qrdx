// Run: cd apps/docs && npx tsx --conditions=react-server --test app/api/ai/art/art.test.ts
// The image pipeline with a fake art model: nothing here calls a paid service,
// and no database query runs (the 503 check happens before any).
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { APICallError, RetryError } from "ai";
import { decodePNGPixels, scanQRPixels } from "qrdx";
import {
  gradientPhoto,
  paintedArt,
  sceneArt,
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

function fakeArtModel(
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

  it("asks the model to keep the grid, the finder eyes and the quiet zone", () => {
    const text = prompt();
    assert.match(text, /^Repaint the QR code .*: a zen garden\.$/m);
    assert.match(text, /same grid/);
    assert.match(text, /finder patterns .* flat and crisp/);
    assert.match(text, /without fine speckles/);
    assert.match(text, /quiet zone\) plain, light/);
    assert.match(text, /No text, letters, logos/);
  });

  it("adds the art model's own rules: GPT Image 2's by default", () => {
    assert.match(prompt(), /Don't zoom, crop or re-center/);
    assert.doesNotMatch(prompt(), /3D blocks/);
    assert.match(
      prompt({ model: "google/gemini-nano-banana-2.1" }),
      /no perspective, depth or 3D blocks/,
    );
    assert.doesNotMatch(
      prompt({ model: "google/gemini-nano-banana-2.1" }),
      /zoom/,
    );
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

describe("generateArtVariant (fake art model)", () => {
  it("delivers the model's image as it is when it scans", async () => {
    const restyled = await paintedArt(control.png, { keep: 0.75 });
    const { model, calls } = fakeArtModel(() => restyled);
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
    const { model } = fakeArtModel(() => textured);
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
    const { model } = fakeArtModel(() => broken);
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
    const { model } = fakeArtModel(() => restyled);
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
    const { model } = fakeArtModel(() => heavy);
    await assert.rejects(
      pipeline.generateArtVariant(request({ model, visibility: 0 })),
      (error: { status?: number; code?: string; message?: string }) =>
        error.status === 502 &&
        error.code === "AI_ART_UNSCANNABLE" &&
        /raise QR visibility/.test(error.message ?? ""),
    );
  });

  it("sends a reference image second", async () => {
    const { model, calls } = fakeArtModel(() => control.png);
    const reference = `data:image/png;base64,${Buffer.from(control.png).toString("base64")}`;
    await pipeline.generateArtVariant(request({ model, reference }));
    assert.equal(calls[0]?.images.length, 2);
    assert.match(calls[0]?.prompt ?? "", /second image is a reference/);
  });

  it("says no credit was used when the model fails", async () => {
    const { model } = fakeArtModel(() => {
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
      const { model } = fakeArtModel(() => {
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
    const { model } = fakeArtModel(() => new Uint8Array([1, 2, 3, 4]));
    await assert.rejects(
      pipeline.generateArtVariant(request({ model })),
      (error: { status?: number; message?: string }) =>
        error.status === 502 &&
        /No AI credit was used/.test(error.message ?? ""),
    );
  });

  it("gives up on a slow model, saying no credit was used", async () => {
    const { model } = fakeArtModel(
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
    const { model } = fakeArtModel(() => {
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

describe("scene and photo modes: the code painted into a picture", () => {
  let paint: typeof import("@/lib/ai/art-picture");
  let photoBytes: Uint8Array;
  before(async () => {
    paint = await import("@/lib/ai/art-picture");
    photoBytes = new Uint8Array(
      Buffer.from((await gradientPhoto()).split(",")[1] ?? "", "base64"),
    );
  });
  const pictureRequest = (overrides: Record<string, unknown> = {}) => ({
    ...request(),
    picture: photoBytes,
    ...overrides,
  });

  it("puts the code and its margin at 64% of the picture, centered", () => {
    const { square, grid } = paint.paintGeometry(33);
    assert.equal(square.side, Math.round(0.64 * 1024));
    assert.ok(Math.abs(square.left + square.side / 2 - 512) <= 1);
    assert.ok(Math.abs(grid.pitch - square.side / 37) < 1e-9);
    assert.ok(Math.abs(grid.left - (square.left + 2 * grid.pitch)) < 1e-9);
  });

  it("asks the model to repaint the picture's square as the code", () => {
    const text = paint.buildPaintPrompt({
      prompt: "a lighthouse.",
      visibility: 50,
      creativity: 45,
      withReference: false,
    });
    assert.match(text, /as the picture in the second image: a lighthouse\.$/m);
    assert.match(text, /carries on through the code/);
    assert.match(text, /Don't paint a plain, pale or white frame/);
    assert.match(text, /Don't zoom, crop or re-center/);
    assert.match(
      paint.buildPaintPrompt({
        prompt: "x",
        visibility: 50,
        creativity: 45,
        withReference: true,
      }),
      /third image is a reference/,
    );
  });

  it("asks for the scene's picture without any code", () => {
    const text = paint.buildPicturePrompt({ prompt: "a lighthouse" });
    assert.match(text, /fills the whole frame, edge to edge: a lighthouse\./);
    assert.doesNotMatch(text, /QR/);
  });

  it("sends the control and the picture's square, and keeps the picture around it", async () => {
    const { model, calls } = fakeArtModel((call) =>
      sceneArt(call.images[0]!, { light: [100, 150, 210], speckle: 50 }),
    );
    const variant = await paint.generatePictureVariant(
      pictureRequest({ model, visibility: 100 }),
    );
    assert.equal(calls[0]?.images.length, 2);
    assert.match(calls[0]?.prompt ?? "", /second image/);
    const pixels = await deliveredPixels(variant.imageUrl);
    assert.equal((await scanQRPixels(pixels, TEXT)).passed, true);
    // The picture's own pixels far from the code.
    const source = (await decodePNGPixels(photoBytes))!;
    for (const [x, y] of [
      [4, 4],
      [1019, 512],
    ] as const) {
      const i = (y * 1024 + x) * 4;
      assert.deepEqual(
        [...pixels.data.subarray(i, i + 3)],
        [...source.data.subarray(i, i + 3)],
      );
    }
    // Light modules lightened in their own color: still blue, not white.
    const { grid } = paint.paintGeometry(33);
    const m = control.map;
    let checked = 0;
    for (let i = 0; i < m.size * m.size && checked < 20; i++) {
      if (m.dark[i] || m.kinds[i] !== 0) continue;
      const x = Math.round(grid.left + ((i % m.size) + 0.5) * grid.pitch);
      const y = Math.round(
        grid.top + (Math.floor(i / m.size) + 0.5) * grid.pitch,
      );
      const p = (y * 1024 + x) * 4;
      const [r, , b] = pixels.data.subarray(p, p + 3);
      assert.ok(b! - r! >= 40, `light module at ${x},${y} lost its color`);
      checked++;
    }
    assert.equal(checked, 20);
  });

  it("limits the Image QR fallback to the code's square", async () => {
    // The picture with no code in it at all, redrawn as Image QR on the
    // square where the code goes; the rest stays the picture's.
    const source = (await decodePNGPixels(photoBytes))!;
    const { grid } = paint.paintGeometry(33);
    const png = await pipeline.blendImageQR({
      text: TEXT,
      pixels: source,
      control: { ...control, grid, mode: "scene" },
      visibility: 50,
    });
    assert.ok(png);
    const pixels = (await decodePNGPixels(png))!;
    assert.equal((await scanQRPixels(pixels, TEXT)).passed, true);
    for (const [x, y] of [
      [4, 4],
      [1019, 1019],
    ] as const) {
      const i = (y * 1024 + x) * 4;
      assert.deepEqual(
        [...pixels.data.subarray(i, i + 3)],
        [...source.data.subarray(i, i + 3)],
      );
    }
  });

  it("sends a reference third", async () => {
    const { model, calls } = fakeArtModel((call) => call.images[0]!);
    const reference = `data:image/png;base64,${Buffer.from(control.png).toString("base64")}`;
    await paint.generatePictureVariant(pictureRequest({ model, reference }));
    assert.equal(calls[0]?.images.length, 3);
  });
});

describe("the sealed picture", () => {
  let seal: typeof import("@/lib/ai/art-seal");
  before(async () => {
    seal = await import("@/lib/ai/art-seal");
  });
  const claims = { userId: "u_alice", text: TEXT, mode: "scene" as const };
  const SECRET = "test-secret-test-secret-test-secret-32";
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const refused =
    (code: string) => (error: { status?: number; code?: string }) =>
      error.status === 400 && error.code === code;

  it("opens for the same user, content and mode", () => {
    const sealed = seal.sealPicture(bytes, claims, SECRET);
    assert.match(sealed, /^[A-Za-z0-9_-]+$/);
    assert.ok(!Buffer.from(sealed, "base64url").includes(Buffer.from(bytes)));
    assert.deepEqual(seal.openPicture(sealed, claims, SECRET), bytes);
  });

  it("refuses another user, other content or another key", () => {
    const sealed = seal.sealPicture(bytes, claims, SECRET);
    assert.throws(
      () => seal.openPicture(sealed, { ...claims, userId: "u_bob" }, SECRET),
      refused("AI_ART_PICTURE_INVALID"),
    );
    assert.throws(
      () =>
        seal.openPicture(sealed, { ...claims, text: "https://x.y" }, SECRET),
      refused("AI_ART_PICTURE_INVALID"),
    );
    assert.throws(
      () => seal.openPicture(sealed, claims, `${SECRET}-other`),
      refused("AI_ART_PICTURE_INVALID"),
    );
  });

  it("expires after 10 minutes", () => {
    const now = Date.now();
    const sealed = seal.sealPicture(bytes, claims, SECRET, now);
    assert.deepEqual(
      seal.openPicture(sealed, claims, SECRET, now + 9 * 60_000),
      bytes,
    );
    assert.throws(
      () => seal.openPicture(sealed, claims, SECRET, now + 11 * 60_000),
      refused("AI_ART_PICTURE_EXPIRED"),
    );
  });

  it("refuses a tampered or truncated seal", () => {
    const sealed = Buffer.from(
      seal.sealPicture(bytes, claims, SECRET),
      "base64url",
    );
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 1;
    for (const bad of [
      tampered.toString("base64url"),
      sealed.subarray(0, 20).toString("base64url"),
      "abc",
    ]) {
      assert.throws(
        () => seal.openPicture(bad, claims, SECRET),
        refused("AI_ART_PICTURE_INVALID"),
      );
    }
  });
});

describe("request body", () => {
  it("fits a photo and a reference, well under Vercel's 4.5 MB", () => {
    assert.ok(art.MAX_ART_REQUEST_BODY_BYTES < 3 * 1024 * 1024);
    assert.ok(art.MAX_ART_REQUEST_BODY_BYTES > (1024 * 1024 * 4) / 3);
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
