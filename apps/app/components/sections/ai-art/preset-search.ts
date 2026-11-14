// What the AI art style picker shows: a tab (Featured, All or a category) or
// search results. Pure, so tests/editor/ai-art-preset-search.test.ts covers it.

import type { AIArtCategory, AIArtPreset } from "./presets";

export type AIArtPresetTab = "featured" | "all" | AIArtCategory;

/** Lowercase, without accents: "Macramé" matches "macrame". */
const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** The search's words; empty when there's nothing to search for. */
export function searchWords(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

/** The presets a tab lists, in catalogue order (Featured in its own order). */
export function presetsForTab(
  presets: readonly AIArtPreset[],
  tab: AIArtPresetTab,
  featuredIds: readonly string[],
): AIArtPreset[] {
  if (tab === "all") return [...presets];
  if (tab === "featured") {
    return featuredIds.flatMap((id) => {
      const preset = presets.find((candidate) => candidate.id === id);
      return preset ? [preset] : [];
    });
  }
  return presets.filter((preset) => preset.category === tab);
}

/**
 * Presets whose name, tags or category hold every word (as the start of one
 * of their words), names that match first.
 */
export function searchPresets(
  presets: readonly AIArtPreset[],
  query: string,
  categoryLabels: Readonly<Record<string, string>>,
): AIArtPreset[] {
  const words = searchWords(query);
  if (words.length === 0) return [...presets];
  const ranked: { preset: AIArtPreset; inName: number; index: number }[] = [];
  presets.forEach((preset, index) => {
    const name = searchWords(preset.name);
    const rest = searchWords(
      [...preset.tags, categoryLabels[preset.category] ?? preset.category].join(
        " ",
      ),
    );
    const matches = (pool: string[], word: string) =>
      pool.some((candidate) => candidate.startsWith(word));
    if (!words.every((word) => matches(name, word) || matches(rest, word))) {
      return;
    }
    const inName = words.filter((word) => matches(name, word)).length;
    ranked.push({ preset, inName, index });
  });
  return ranked
    .sort((a, b) => b.inName - a.inName || a.index - b.index)
    .map(({ preset }) => preset);
}
