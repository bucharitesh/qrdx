// Run: cd apps/docs && npx tsx --test components/sections/ai-art/config.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ART_MAX_SEED,
  ART_REFERENCE_MAX_BYTES,
  aiArtRequestSchema,
  creativityToGuidanceScale,
  isFalResultUrl,
  seedsForRun,
  visibilityToConditioningScale,
} from "./config";
import { AI_ART_CATEGORIES, AI_ART_PRESETS } from "./presets";

const base = { text: "https://qrdx.dev", prompt: "a zen garden" };
const png = (bytes: number) =>
  `data:image/png;base64,${Buffer.alloc(bytes, 1).toString("base64")}`;

describe("slider mappings", () => {
  it("maps QR visibility onto the ControlNet conditioning scale", () => {
    assert.equal(visibilityToConditioningScale(0), 0.8);
    assert.equal(visibilityToConditioningScale(50), 1.4);
    assert.equal(visibilityToConditioningScale(100), 2);
    assert.equal(visibilityToConditioningScale(500), 2);
  });

  it("maps creativity onto the guidance scale (higher = freer)", () => {
    assert.equal(creativityToGuidanceScale(0), 12);
    assert.equal(creativityToGuidanceScale(100), 4);
    assert.ok(creativityToGuidanceScale(30) > creativityToGuidanceScale(70));
  });
});

describe("seedsForRun", () => {
  it("counts up from a locked seed", () => {
    assert.deepEqual(seedsForRun(3, 41), [41, 42, 43]);
    assert.deepEqual(seedsForRun(2, ART_MAX_SEED), [ART_MAX_SEED, 0]);
  });

  it("draws independent random seeds when unlocked", () => {
    const values = [0.1, 0.5, 0.9];
    const seeds = seedsForRun(3, undefined, () => values.shift() ?? 0);
    assert.equal(new Set(seeds).size, 3);
    for (const seed of seeds) {
      assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= ART_MAX_SEED);
    }
  });
});

describe("aiArtRequestSchema", () => {
  it("applies defaults", () => {
    const parsed = aiArtRequestSchema.parse(base);
    assert.equal(parsed.variations, 1);
    assert.equal(parsed.visibility, 50);
    assert.equal(parsed.reference, undefined);
  });

  it("accepts 1 to 4 variations", () => {
    assert.ok(aiArtRequestSchema.safeParse({ ...base, variations: 4 }).success);
    assert.ok(
      !aiArtRequestSchema.safeParse({ ...base, variations: 5 }).success,
    );
    assert.ok(
      !aiArtRequestSchema.safeParse({ ...base, variations: 0 }).success,
    );
  });

  it("only accepts uploaded PNG/JPEG data URLs as references", () => {
    assert.ok(
      aiArtRequestSchema.safeParse({ ...base, reference: png(100) }).success,
    );
    for (const reference of [
      "https://example.com/photo.png",
      "http://169.254.169.254/latest/meta-data",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:image/png,not-base64",
      "file:///etc/passwd",
    ]) {
      assert.ok(
        !aiArtRequestSchema.safeParse({ ...base, reference }).success,
        reference,
      );
    }
  });

  it("caps the reference size", () => {
    assert.ok(
      !aiArtRequestSchema.safeParse({
        ...base,
        reference: png(ART_REFERENCE_MAX_BYTES + 1),
      }).success,
    );
  });

  it("bounds the seed and the negative prompt", () => {
    assert.ok(
      !aiArtRequestSchema.safeParse({ ...base, seed: ART_MAX_SEED + 1 })
        .success,
    );
    assert.ok(
      !aiArtRequestSchema.safeParse({
        ...base,
        negativePrompt: "x".repeat(301),
      }).success,
    );
  });
});

describe("isFalResultUrl", () => {
  it("allows fal.ai's result hosts only", () => {
    assert.ok(isFalResultUrl("https://v3.fal.media/files/abc/image.png"));
    assert.ok(isFalResultUrl("https://fal.media/files/abc.png"));
    assert.ok(
      isFalResultUrl(
        "https://storage.googleapis.com/falserverless/model/out.png",
      ),
    );
    assert.ok(!isFalResultUrl("http://v3.fal.media/files/abc.png"));
    assert.ok(!isFalResultUrl("https://evil.com/fal.media/x.png"));
    assert.ok(!isFalResultUrl("https://fal.media.evil.com/x.png"));
    assert.ok(!isFalResultUrl("https://storage.googleapis.com/other/x.png"));
    assert.ok(!isFalResultUrl("not a url"));
  });
});

describe("presets", () => {
  it("offers at least 30 styles with unique ids in known categories", () => {
    assert.ok(AI_ART_PRESETS.length >= 30);
    assert.equal(
      new Set(AI_ART_PRESETS.map((preset) => preset.id)).size,
      AI_ART_PRESETS.length,
    );
    const categories = new Set(AI_ART_CATEGORIES.map(({ id }) => id));
    for (const preset of AI_ART_PRESETS) {
      assert.ok(categories.has(preset.category), preset.id);
      assert.ok(preset.prompt.length <= 400, preset.id);
      assert.ok(preset.swatch.startsWith("linear-gradient("), preset.id);
    }
    for (const { id } of AI_ART_CATEGORIES) {
      assert.ok(
        AI_ART_PRESETS.filter((preset) => preset.category === id).length >= 3,
        id,
      );
    }
  });
});
