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

describe("scene control", () => {
  const pixelAt = async (png: Uint8Array, x: number, y: number) => {
    const pixels = (await decodePNGPixels(png))!;
    const i = (y * pixels.width + x) * 4;
    return [...pixels.data.subarray(i, i + 3)];
  };

  it("places the code at about two thirds of the image, centered, on whole pixels", () => {
    const grid = pipeline.sceneGrid(33);
    assert.equal(grid.pitch, Math.floor((0.64 * 1024) / 33));
    assert.ok(Number.isInteger(grid.left) && Number.isInteger(grid.top));
    const side = 33 * grid.pitch;
    assert.ok(Math.abs(grid.left + side / 2 - 512) <= 1);
    assert.ok(Math.abs(grid.top + side / 2 - 512) <= 1);
  });

  it("keeps the code and its margin inside the image wherever it's asked to go", () => {
    for (const layout of [
      { ...pipeline.SCENE_LAYOUT, y: 1 },
      { ...pipeline.SCENE_LAYOUT, x: 0, size: 0.9 },
      { ...pipeline.SCENE_LAYOUT, y: 0.62, size: 0.5 },
    ]) {
      const grid = pipeline.sceneGrid(33, layout);
      const edge = Math.ceil(layout.margin * grid.pitch);
      for (const start of [grid.left, grid.top]) {
        assert.ok(start >= edge);
        assert.ok(start + 33 * grid.pitch + edge <= 1024);
      }
    }
    const lower = pipeline.sceneGrid(33, {
      ...pipeline.SCENE_LAYOUT,
      y: 0.62,
      size: 0.5,
    });
    assert.ok(lower.top > pipeline.sceneGrid(33).top);
  });

  it("draws the same code on a grey canvas, and it still decodes", async () => {
    const scene = pipeline.sceneControl(control);
    assert.equal(scene.mode, "scene");
    assert.deepEqual(scene.map, control.map);
    assert.deepEqual(scene.grid, pipeline.sceneGrid(33));
    const pixels = (await decodePNGPixels(scene.png))!;
    assert.equal(pixels.width, 1024);
    assert.equal((await scanQRPixels(pixels, TEXT)).passed, true);
    assert.deepEqual(await pixelAt(scene.png, 4, 4), [150, 150, 150]);
    // The light margin right outside the code.
    const { left, top, pitch } = scene.grid;
    assert.deepEqual(
      await pixelAt(scene.png, left - 2, top + 10 * pitch),
      [255, 255, 255],
    );
  });

  it("draws photo mode's code over the photo, letting it show through", async () => {
    const photo = (await decodePNGPixels(
      new Uint8Array(
        Buffer.from((await gradientPhoto()).split(",")[1]!, "base64"),
      ),
    ))!;
    const scene = pipeline.sceneControl(control, {
      mode: "photo",
      photo,
      layout: pipeline.PHOTO_LAYOUT,
    });
    assert.equal(scene.mode, "photo");
    // Outside the code: the photo itself.
    const corner = (4 * 1024 + 4) * 4;
    assert.deepEqual(await pixelAt(scene.png, 4, 4), [
      ...photo.data.subarray(corner, corner + 3),
    ]);
    // A dark finder module: mostly dark, with a little of the photo.
    const { left, top } = scene.grid;
    const [r, g, b] = await pixelAt(scene.png, left + 2, top + 2);
    assert.ok(Math.max(r!, g!, b!) > 0 && Math.max(r!, g!, b!) < 60);
    assert.equal(
      (await scanQRPixels((await decodePNGPixels(scene.png))!, TEXT)).passed,
      true,
    );
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

  it("asks scene mode for a full-bleed picture with the code built into it", () => {
    const text = prompt({ mode: "scene" });
    assert.match(text, /^Paint one full-bleed picture .*: a zen garden\.$/m);
    assert.match(text, /Replace the flat grey background/);
    assert.match(text, /Don't draw it as a printed QR code/);
    assert.match(text, /finder patterns .* in its darkest tone/);
    assert.match(text, /never flat black and white/);
    assert.match(text, /same pixels and size/);
    assert.match(text, /Don't zoom, crop or re-center/);
    assert.doesNotMatch(text, /quiet zone\) plain/);
    assert.match(
      prompt({ mode: "scene", visibility: 10 }),
      /Favor the picture/,
    );
    assert.match(prompt({ mode: "scene", visibility: 90 }), /Favor the code/);
  });

  it("asks photo mode to keep the photo and paint the code into it", () => {
    const text = prompt({ mode: "photo" });
    assert.match(text, /first image is a photo with a QR code placed on it/);
    assert.match(
      text,
      /Keep the photo's subject, composition, colors and light/,
    );
    assert.match(text, /finder patterns/);
    assert.match(
      prompt({ mode: "photo", withReference: true }),
      /second image is a reference/,
    );
    const second = prompt({
      mode: "photo",
      photoInput: "second",
      withReference: true,
    });
    assert.match(second, /second image is a photo/);
    assert.match(second, /third image is a reference/);
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

  it("sends scene mode's own control and delivers its scene, colors kept", async () => {
    let art: Uint8Array | undefined;
    const { model, calls } = fakeArtModel(async (call) => {
      art = await sceneArt(call.images[0]!, {
        light: [100, 150, 210],
        speckle: 50,
      });
      return art;
    });
    const variant = await pipeline.generateArtVariant(
      request({ model, mode: "scene", visibility: 100 }),
    );
    const scene = pipeline.sceneControl(control);
    assert.deepEqual(calls[0]?.images, [scene.png]);
    assert.match(calls[0]?.prompt ?? "", /full-bleed picture/);
    assert.equal(variant.blend, "least");
    const pixels = await deliveredPixels(variant.imageUrl);
    assert.equal((await scanQRPixels(pixels, TEXT)).passed, true);
    const raw = (await decodePNGPixels(art!))!;
    // The scene far outside the code is the model's, pixel for pixel.
    assert.deepEqual(
      [...pixels.data.subarray(0, 4)],
      [...raw.data.subarray(0, 4)],
    );
    // A light module of the code stays blue (lightened in its own color),
    // not white or grey.
    const { left, top, pitch } = scene.grid;
    const m = control.map;
    let checked = 0;
    for (let i = 0; i < m.size * m.size && checked < 20; i++) {
      if (m.dark[i] || m.kinds[i] !== 0) continue;
      const x = Math.round(left + ((i % m.size) + 0.5) * pitch);
      const y = Math.round(top + (Math.floor(i / m.size) + 0.5) * pitch);
      const p = (y * 1024 + x) * 4;
      const [r, , b] = pixels.data.subarray(p, p + 3);
      assert.ok(b! - r! >= 40, `light module at ${x},${y} lost its color`);
      checked++;
    }
    assert.equal(checked, 20);
  });

  it("limits the Image QR fallback to the code's square in scene mode", async () => {
    // A "scene" with no code in it at all: only Image QR can make it scan.
    const blank = await sceneArt(pipeline.sceneControl(control).png, {
      light: [120, 130, 140],
      dark: [120, 130, 140],
    });
    const { model } = fakeArtModel(() => blank);
    const variant = await pipeline.generateArtVariant(
      request({ model, mode: "scene" }),
    );
    assert.equal(variant.blend, "image-qr");
    const pixels = await deliveredPixels(variant.imageUrl);
    assert.equal((await scanQRPixels(pixels, TEXT)).passed, true);
    const raw = (await decodePNGPixels(blank))!;
    for (const [x, y] of [
      [4, 4],
      [1019, 512],
      [512, 1019],
    ] as const) {
      const i = (y * 1024 + x) * 4;
      assert.deepEqual(
        [...pixels.data.subarray(i, i + 3)],
        [...raw.data.subarray(i, i + 3)],
        `${x},${y} changed`,
      );
    }
  });

  it("sends photo mode's photo inside the control, and a reference second", async () => {
    const photo = await gradientPhoto();
    const { model, calls } = fakeArtModel((call) => sceneArt(call.images[0]!));
    const reference = `data:image/png;base64,${Buffer.from(control.png).toString("base64")}`;
    const variant = await pipeline.generateArtVariant(
      request({ model, mode: "photo", photo, reference }),
    );
    assert.equal(calls[0]?.images.length, 2);
    assert.match(calls[0]?.prompt ?? "", /first image is a photo/);
    assert.match(calls[0]?.prompt ?? "", /second image is a reference/);
    // The control's corner is the photo's corner.
    const sent = (await decodePNGPixels(calls[0]!.images[0]!))!;
    const source = (await decodePNGPixels(
      new Uint8Array(Buffer.from(photo.split(",")[1]!, "base64")),
    ))!;
    assert.deepEqual(
      [...sent.data.subarray(0, 3)],
      [...source.data.subarray(0, 3)],
    );
    assert.equal(
      (await scanQRPixels(await deliveredPixels(variant.imageUrl), TEXT))
        .passed,
      true,
    );
  });

  it("refuses photo mode without a photo", async () => {
    const { model, calls } = fakeArtModel(() => control.png);
    await assert.rejects(
      pipeline.generateArtVariant(request({ model, mode: "photo" })),
      (error: { status?: number }) => error.status === 400,
    );
    assert.equal(calls.length, 0);
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
