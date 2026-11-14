// Seeded pseudo-random generator (mulberry32) for reproducible property tests.
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T =>
    items[int(0, items.length - 1)] as T;
  const string = (alphabet: readonly string[], min: number, max: number) =>
    Array.from({ length: int(min, max) }, () => pick(alphabet)).join("");
  return { next, int, pick, string, bool: () => next() < 0.5 };
}

const LATIN =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");

/** Characters that break naive encoders: separators, escapes, unicode, emoji. */
export const HOSTILE = [
  ...LATIN,
  " ",
  ";",
  ",",
  ":",
  "\\",
  '"',
  "'",
  "&",
  "?",
  "#",
  "%",
  "+",
  "=",
  "/",
  "@",
  "\n",
  "é",
  "ü",
  "ß",
  "東",
  "京",
  "😀",
  "👋🏽",
  "€",
  "<",
  ">",
] as const;

export const ALNUM = LATIN;
