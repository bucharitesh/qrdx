// The AI art style picker's tabs and search (components/sections/ai-art/preset-search.ts),
// and the lazily loaded catalogue behind it (load-presets.ts).
import { describe, expect, it } from "vitest";
import { loadAIArtPresets } from "@/components/sections/ai-art/load-presets";
import {
  AI_ART_CATEGORIES,
  AI_ART_PRESET_COUNT,
} from "@/components/sections/ai-art/preset-meta";
import {
  presetsForTab,
  searchPresets,
  searchWords,
} from "@/components/sections/ai-art/preset-search";
import {
  AI_ART_FEATURED_PRESET_IDS,
  AI_ART_PRESETS,
  type AIArtPreset,
} from "@/components/sections/ai-art/presets";

const LABELS = Object.fromEntries(
  AI_ART_CATEGORIES.map(({ id, label }) => [id, label]),
);

const preset = (
  id: string,
  name: string,
  category: AIArtPreset["category"],
  tags: string[] = [],
): AIArtPreset => ({ id, name, category, tags, prompt: `${name} prompt` });

const SAMPLE = [
  preset("tiles", "Zellige tiles", "culture", ["morocco", "green"]),
  preset("cats", "Cozy cats", "animals", ["kittens", "pets"]),
  preset("macrame", "Macramé", "craft", ["boho"]),
  preset("greenhouse", "Palm house", "architecture", ["greenhouse", "plants"]),
  preset("forest", "Green forest", "nature", ["trees"]),
];

describe("searchWords", () => {
  it("folds case and accents and drops punctuation", () => {
    expect(searchWords("  Macramé, GOLD!  ")).toEqual(["macrame", "gold"]);
    expect(searchWords("children's")).toEqual(["children's"]);
    expect(searchWords(" ,. ")).toEqual([]);
  });
});

describe("presetsForTab", () => {
  it("lists a category in catalogue order", () => {
    expect(presetsForTab(SAMPLE, "animals", []).map((p) => p.id)).toEqual([
      "cats",
    ]);
  });

  it("lists Featured in its own order and skips unknown ids", () => {
    expect(
      presetsForTab(SAMPLE, "featured", ["forest", "nope", "tiles"]).map(
        (p) => p.id,
      ),
    ).toEqual(["forest", "tiles"]);
  });

  it("lists everything on All", () => {
    expect(presetsForTab(SAMPLE, "all", [])).toHaveLength(SAMPLE.length);
  });
});

describe("searchPresets", () => {
  it("matches the start of words in names, tags and category labels", () => {
    expect(searchPresets(SAMPLE, "kitt", LABELS).map((p) => p.id)).toEqual([
      "cats",
    ]);
    expect(searchPresets(SAMPLE, "world", LABELS).map((p) => p.id)).toEqual([
      "tiles",
    ]);
    expect(searchPresets(SAMPLE, "macrame", LABELS).map((p) => p.id)).toEqual([
      "macrame",
    ]);
    // Not the middle of a word: "ouse" isn't "house"
    expect(searchPresets(SAMPLE, "ouse", LABELS)).toEqual([]);
  });

  it("needs every word and ranks name matches first", () => {
    expect(searchPresets(SAMPLE, "green", LABELS).map((p) => p.id)).toEqual([
      "forest",
      "tiles",
      "greenhouse",
    ]);
    expect(
      searchPresets(SAMPLE, "green trees", LABELS).map((p) => p.id),
    ).toEqual(["forest"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchPresets(SAMPLE, "  ", LABELS)).toHaveLength(SAMPLE.length);
  });

  it("finds real styles by everyday words", () => {
    const ids = (query: string) =>
      searchPresets(AI_ART_PRESETS, query, LABELS).map((p) => p.id);
    expect(ids("cat")).toContain("cozy-cats");
    expect(ids("christmas")).toContain("christmas-ornaments");
    expect(ids("tiles")).toEqual(
      expect.arrayContaining(["zellige", "azulejo"]),
    );
  });
});

describe("the catalogue", () => {
  it("loads lazily, once, with every preset and the featured ones", async () => {
    const first = loadAIArtPresets();
    const second = loadAIArtPresets();
    const catalogue = await first;
    expect(await second).toBe(catalogue);
    expect(catalogue.AI_ART_PRESETS).toHaveLength(AI_ART_PRESET_COUNT);
    expect(
      presetsForTab(
        catalogue.AI_ART_PRESETS,
        "featured",
        AI_ART_FEATURED_PRESET_IDS,
      ),
    ).toHaveLength(AI_ART_FEATURED_PRESET_IDS.length);
  });
});
