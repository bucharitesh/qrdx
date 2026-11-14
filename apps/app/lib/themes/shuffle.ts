// Shuffle: a fresh theme from the generator's building blocks, picked at
// runtime. Each shuffle is a seed, and its preset id ("shuffle-<seed>")
// recomposes the same theme anywhere, so undo, "Back" and a reload all land
// on the exact same look. Only contrast is checked here; the blocks
// themselves are vetted by scripts/themes/generate.ts and the scan test.
import type { ThemeStyles } from "@/types/theme";
import {
  type ComposedTheme,
  composeTheme,
  contrastProblems,
  createRandom,
} from "./compose";

export const SHUFFLE_PREFIX = "shuffle-";

const MAX_ATTEMPTS = 40;

const SAFE_STYLES: ThemeStyles = {
  bgColor: "#FFFFFF",
  fgColor: "#111111",
  eyeColor: "#111111",
  dotColor: "#111111",
  bodyPattern: "rounded",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "rounded",
  level: "Q",
  margin: 4,
};

export const shuffleId = (seed: number) => `${SHUFFLE_PREFIX}${seed >>> 0}`;

/** The seed in a shuffle preset id, or null for any other id. */
export function shuffleSeed(id: string | null | undefined): number | null {
  if (!id?.startsWith(SHUFFLE_PREFIX)) return null;
  const seed = Number(id.slice(SHUFFLE_PREFIX.length));
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xff_ff_ff_ff
    ? seed
    : null;
}

export const isShuffleId = (id: string | null | undefined) =>
  shuffleSeed(id) !== null;

/** A random 32-bit seed. */
export function newShuffleSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  }
  return Math.floor(Math.random() * 0x1_00_00_00_00);
}

const cache = new Map<number, ComposedTheme>();

/** The theme a seed composes: always the same for the same seed. */
export function shuffleTheme(seed: number): ComposedTheme {
  const cached = cache.get(seed);
  if (cached) return cached;
  const random = createRandom(seed);
  let theme: ComposedTheme | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !theme; attempt++) {
    const candidate = composeTheme(random);
    if (contrastProblems(candidate.styles).length === 0) theme = candidate;
  }
  // The blocks always pass contrast; this only guards future edits.
  theme ??= { ...composeTheme(createRandom(0)), styles: SAFE_STYLES };
  if (cache.size > 200) cache.clear();
  cache.set(seed, theme);
  return theme;
}
