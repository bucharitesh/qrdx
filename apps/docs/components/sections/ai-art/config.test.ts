// Run: cd apps/docs && npx tsx --test components/sections/ai-art/config.test.ts
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ART_MAX_SEED,
  ART_PHOTO_MAX_BYTES,
  ART_PHOTO_MAX_SIDE,
  ART_REFERENCE_MAX_BYTES,
  aiArtRequestSchema,
  artDescribeRequestSchema,
  seedsForRun,
} from "./config";
import { AI_ART_PRESET_COUNT, aiArtPresetPreview } from "./preset-meta";
import {
  AI_ART_CATEGORIES,
  AI_ART_FEATURED_PRESET_IDS,
  AI_ART_PRESETS,
} from "./presets";

const PUBLIC = join(import.meta.dirname, "../../../public");

const base = { text: "https://qrdx.dev", prompt: "a zen garden" };
const png = (bytes: number) =>
  `data:image/png;base64,${Buffer.alloc(bytes, 1).toString("base64")}`;

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
    assert.equal(parsed.visibility, 50);
    assert.equal(parsed.seed, undefined);
    assert.equal(parsed.reference, undefined);
  });

  it("asks for one image per request (variations are separate requests)", () => {
    const parsed = aiArtRequestSchema.parse({ ...base, variations: 4 });
    assert.equal("variations" in parsed, false);
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

  it("takes a photo only in photo mode, larger than a reference", () => {
    assert.equal(aiArtRequestSchema.parse(base).mode, "code");
    const photo = png(ART_REFERENCE_MAX_BYTES + 1);
    assert.ok(
      aiArtRequestSchema.safeParse({ ...base, mode: "photo", photo }).success,
    );
    assert.ok(
      !aiArtRequestSchema.safeParse({ ...base, mode: "photo" }).success,
    );
    assert.ok(
      !aiArtRequestSchema.safeParse({ ...base, mode: "scene", photo }).success,
    );
    assert.ok(aiArtRequestSchema.safeParse({ ...base, mode: "scene" }).success);
  });

  it("lets Write one for me read the same photo the art gets", () => {
    const photo = png(ART_REFERENCE_MAX_BYTES + 1);
    assert.ok(
      artDescribeRequestSchema.safeParse({ mode: "photo", photo }).success,
    );
    assert.ok(
      !artDescribeRequestSchema.safeParse({
        mode: "photo",
        photo: png(ART_PHOTO_MAX_BYTES + 1),
      }).success,
    );
  });

  it("caps the photo's size and only accepts uploaded PNG/JPEG data URLs", () => {
    assert.ok(ART_PHOTO_MAX_SIDE >= 1024);
    assert.ok(ART_PHOTO_MAX_BYTES > ART_REFERENCE_MAX_BYTES);
    const photo = (value: string) =>
      aiArtRequestSchema.safeParse({ ...base, mode: "photo", photo: value })
        .success;
    assert.ok(photo(png(ART_PHOTO_MAX_BYTES)));
    assert.ok(!photo(png(ART_PHOTO_MAX_BYTES + 1)));
    assert.ok(!photo("https://example.com/photo.jpg"));
    assert.ok(!photo("data:image/webp;base64,AAAA"));
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

describe("presets", () => {
  it("offers styles with unique ids in known categories", () => {
    assert.ok(AI_ART_PRESETS.length >= 30);
    assert.equal(
      new Set(AI_ART_PRESETS.map((preset) => preset.id)).size,
      AI_ART_PRESETS.length,
    );
    assert.equal(
      new Set(AI_ART_PRESETS.map((preset) => preset.name)).size,
      AI_ART_PRESETS.length,
    );
    const categories = new Set(AI_ART_CATEGORIES.map(({ id }) => id));
    for (const preset of AI_ART_PRESETS) {
      assert.ok(categories.has(preset.category), preset.id);
      assert.ok(preset.prompt.length <= 400, preset.id);
      assert.ok(preset.tags.length > 0, preset.id);
      for (const tag of preset.tags) {
        assert.equal(tag, tag.toLowerCase(), preset.id);
      }
      if (preset.swatch) {
        assert.ok(preset.swatch.startsWith("linear-gradient("), preset.id);
      }
    }
    for (const { id } of AI_ART_CATEGORIES) {
      assert.ok(
        AI_ART_PRESETS.filter((preset) => preset.category === id).length >= 3,
        id,
      );
    }
  });

  it("counts them where copy reads the number (preset-meta.ts)", () => {
    assert.equal(AI_ART_PRESET_COUNT, AI_ART_PRESETS.length);
  });

  it("has a small preview for every style and none left over", () => {
    for (const preset of AI_ART_PRESETS) {
      const file = join(PUBLIC, aiArtPresetPreview(preset.id));
      assert.ok(existsSync(file), `no preview for ${preset.id}`);
      assert.ok(
        statSync(file).size < 40 * 1024,
        `${preset.id} preview is large`,
      );
    }
    const ids = new Set(AI_ART_PRESETS.map((preset) => preset.id));
    const stray = readdirSync(join(PUBLIC, "images/ai-art-styles")).filter(
      (file) => !ids.has(file.replace(/\.webp$/, "")),
    );
    assert.deepEqual(stray, []);
  });

  it("features known styles, once each", () => {
    const ids = new Set(AI_ART_PRESETS.map((preset) => preset.id));
    assert.ok(AI_ART_FEATURED_PRESET_IDS.length >= 6);
    assert.equal(
      new Set(AI_ART_FEATURED_PRESET_IDS).size,
      AI_ART_FEATURED_PRESET_IDS.length,
    );
    for (const id of AI_ART_FEATURED_PRESET_IDS) assert.ok(ids.has(id), id);
  });

  it("keeps artists, brands and characters out of the prompts", () => {
    const names =
      /\b(van gogh|monet|picasso|hokusai|klimt|mucha|warhol|lichtenstein|seurat|matisse|ghibli|disney|pixar|lego|polaroid|kodak|kodachrome|lomo|instagram|pantone|tiffany|spirograph|minecraft|pokemon|marvel)\b/i;
    for (const preset of AI_ART_PRESETS) {
      assert.doesNotMatch(
        `${preset.name} ${preset.prompt} ${preset.tags.join(" ")}`,
        names,
        preset.id,
      );
    }
  });
});
