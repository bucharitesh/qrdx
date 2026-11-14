/** biome-ignore-all lint/style/noMagicNumbers: the artwork's own geometry */
// The drawing of the dot ring template (dot-ring.tsx): its geometry, the
// dots around the code and which of them a link draws, and the text along
// the ring. Kept out of template/index.ts, so none of it becomes public API.
// The dot layout and the way a link picks its dots come from the first
// round design built on qrdx's custom templates (2025), so designs made
// with it keep their rings.
import { sanitizeFrameText } from "../../types/frame-spec-rules";
import { roundTo } from "../utils/fmt";

// ── Geometry (a 593 × 593 drawing) ────────────────────────────────────────

export const VIEW = 593;
export const CENTER = 296.5;
/** The code (300 × 300) sits in the middle. */
export const CODE_OFFSET = 146.5;
export const BACKGROUND_RADIUS = 294.5;
export const RING_INNER_RADIUS = 231.228;
/** The ring: the whole disc minus the inner one. */
export const RING_PATH =
  "M296.5 0C460.252 -7.15782e-06 593 132.748 593 296.5C593 460.252 460.253 593 296.5 593C132.748 593 7.15782e-06 460.252 0 296.5C-7.15788e-06 132.748 132.748 7.15788e-06 296.5 0ZM296.5 527.728C424.204 527.728 527.728 424.204 527.728 296.5C527.728 168.796 424.204 65.2713 296.5 65.2713C168.796 65.2713 65.2714 168.796 65.2714 296.5C65.2714 424.204 168.796 527.728 296.5 527.728Z";

// ── Decorative dots ───────────────────────────────────────────────────────

// The 297 dot centers, in their original order (the order decides which
// dots a link gets). DOT_X and DOT_Y list the distinct x and y
// values in ten-thousandths of a unit, each as the base-36 step from the one
// before; DOT_CELLS gives each dot as three base-36 digits of
// xIndex × DOT_ROWS + yIndex. tests/dot-ring-template.test.ts checks them
// against the original table.
const DOT_X =
  "iaa2 1z3g 1z0y 1z18 1z18 1we8 2mq 1uta 47y 1rx4 73u 1rx4 73u 1rxe 73u 1rx4 73u 1rxe 73u 1rx4 73u 1rxe 73u 1rx4 73u 1rzm 71m 1rzm 71m 1rzc 73u okq 13ce 744 1rx4 744 1rwu 744 1rx4 744 1rx4 73u 1rx4 744 1rx4 73u 1rx4 73u 1rx4 744 1rx4 73u 1rxe 73u 1rx4 73u 1rx4 744 1rzm 71c 1rzm 73u 1rxe 73u 1rx4 744 1rx4 73u 1rx4 73u 1rxe 73u 1rx4 618 12m 1rxe 73u 1z0y 1z18 1z0y 1z18 1z0y 1z18 1z18";
const DOT_Y =
  "hqpr 5 1z36 1z0y 1z18 1z18 1z0y 1z0y 1a7w otc 1z0y 1z18 1z0y 1z18 1z0y 1z1i 1z0o 1z18 1z0y 1z3q 1z0y 1z18 1z0y 1z18 1z0y 1z18 1z0y 1z18 1z0y 1z18 1z0y 1lk8 dgq 1z18 1z18 1z3g 1z0y 1z0y 1z18 1z18 1z0y 1z0y 1z18 1yx2 3w 1z18 60o 1t0a 1z18 1z0y 1z18 1z0y";
const DOT_CELLS =
  "3cf27f17c00j3ch21n1ek00l1el3cj1vv1kd00n3cl3cn1q31q500p3cp1vx00r1kb3cs3aw1ej21p00t3ax3ay17b27h00w3b02g20yq01w2d611m01x3b52aa14i01y24i1bq0203bd3be1q21q60253bf39e39f39h14e2ae02d39j11i2da02e39l0ym02f39n2lt0sz03a39p2ix0vv03b39r2d511n39t03d27d17f03f39x39y21l1en03h3a03a11vt1kf03j37w37x1q11q703l37z1k903n1vz3821eh03p21r38714d03t11h03u2db38a0vp2j303w2lz38g03x0st2rk0n804o38l2oo0q404p38n2iw0vw04r36f36h2a814k04u36k36l1vs1kg04z36o36p1n41t405236q36x36y0ss2m005d3720n02rs05f3742uf0kd0633763772on0q506537834y2fz0yt06834z2d311p06935235424f1bt06c35621j1ep06d3581yn1hl06e35a1sv1nd06g35b1pz1q906h35d35e35g1ef21t06l35h1bj24p06m35k35l11f2dd06q35n0vn2j506s35p35q0pv2ox06u35s0mz2rt06v35t33h0k32up06w2x90hi08y2ud0ke08z33r2lp0t20922fx0yu0942a514m09624d1bu0983441yl1hm09a1vp1ki09b1px1qa09d34e1n11t609e1h91yy09g1ed21u09h1a227m0831492ai09l0yh2ga09n0sp2m209p0pt2oy09q0k12uq09s2xo0h52z209t31k0en0bt2780c319z0az0e831z0cq";
const DOT_ROWS = 52;
/** How many of the dots a code draws. */
const DOTS_DRAWN = 240;

export interface Dot {
  cx: number;
  cy: number;
}

function decodeSteps(steps: string): number[] {
  let value = 0;
  return steps.split(" ").map((step) => {
    value += Number.parseInt(step, 36);
    return value / 10_000;
  });
}

let ringDots: readonly Dot[] | undefined;

/** Every dot position, decoded on first use. */
export function dotRingPositions(): readonly Dot[] {
  if (!ringDots) {
    const xs = decodeSteps(DOT_X);
    const ys = decodeSteps(DOT_Y);
    const dots: Dot[] = [];
    for (let i = 0; i < DOT_CELLS.length; i += 3) {
      const cell = Number.parseInt(DOT_CELLS.slice(i, i + 3), 36);
      dots.push({
        cx: xs[Math.floor(cell / DOT_ROWS)] as number,
        cy: ys[cell % DOT_ROWS] as number,
      });
    }
    ringDots = dots;
  }
  return ringDots;
}

/** A 31-bit hash of the code's content. */
function contentHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = hash * 32 - hash + text.charCodeAt(i);
    hash %= 2_147_483_647;
  }
  return Math.abs(hash);
}

/**
 * The dots `value` draws: a seeded shuffle (a linear congruential
 * generator and a Fisher–Yates pass) picks DOTS_DRAWN of them, kept in
 * their original order.
 */
export function dotRingDots(value: string): Dot[] {
  const dots = dotRingPositions();
  let state = contentHash(value);
  const random = () => {
    state = (state * 9301 + 49_297) % 233_280;
    return state / 233_280;
  };
  const order = dots.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return order
    .slice(0, DOTS_DRAWN)
    .sort((a, b) => a - b)
    .map((index) => dots[index] as Dot);
}

/** The code's width in the drawing (its 300 × 300 drawing, unscaled). */
const CODE_SIZE = 300;
/**
 * A code more than this many modules across (version 9 and up) has modules
 * much smaller than the ring's dots are spaced, and dots right next to it
 * stop decoders finding it at small sizes; up to here they read fine.
 */
const DENSE_MODULES = 49;
/** The light band a dense code keeps clear of dots, in modules. */
const DENSE_QUIET_MODULES = 6;

/**
 * `dots` as a code with modules `moduleSize` across draws them, each a disc
 * half a module in radius: all of them, or for a dense code only those at
 * least DENSE_QUIET_MODULES modules clear of it.
 */
export function dotsClearOfCode(
  dots: readonly Dot[],
  moduleSize: number
): readonly Dot[] {
  if (CODE_SIZE / moduleSize <= DENSE_MODULES + 0.5) {
    return dots;
  }
  const start = CODE_OFFSET;
  const end = CODE_OFFSET + CODE_SIZE;
  const band = DENSE_QUIET_MODULES * moduleSize + moduleSize / 2;
  return dots.filter(({ cx, cy }) => {
    const away = Math.max(start - cx, cx - end, start - cy, cy - end);
    return away >= band;
  });
}

// ── Text on the ring ──────────────────────────────────────────────────────

/** Four times round, it closes the ring with an even gap at the bottom. */
export const DEFAULT_TEXT =
  "Scan the QR code * Scan the QR code * Scan the QR code * Scan the QR code *";
export const DEFAULT_FONT_SIZE = 32;
export const DEFAULT_LETTER_SPACING = 3.5;
/** Letters are spaced along this circle. */
const TEXT_PATH_RADIUS = 246.5;
/** Half a cap height, in em: the letters' band is centered on TEXT_BAND_RADIUS. */
const HALF_CAP = 0.36;
const TEXT_BAND_RADIUS = TEXT_PATH_RADIUS + HALF_CAP * DEFAULT_FONT_SIZE;
/** Longest text read, in code points (more never fits around the ring). */
const TEXT_MAX_LENGTH = 400;

/** A rough letter width for a heavy sans-serif. */
function letterWidth(char: string, fontSize: number): number {
  if (char === " " || /[il1|!']/.test(char)) {
    return fontSize * 0.3;
  }
  if (/[mwMW@%&]/.test(char)) {
    return fontSize * 0.8;
  }
  return fontSize * 0.6;
}

/** The text as drawn: no control or invisible characters, spaces kept. */
function cleanText(text: string): string[] {
  const clean = text
    .slice(0, TEXT_MAX_LENGTH)
    .split(" ")
    .map((word) => sanitizeFrameText(word, TEXT_MAX_LENGTH))
    .join(" ");
  return Array.from(clean).slice(0, TEXT_MAX_LENGTH);
}

export interface RingLetter {
  char: string;
  x: number;
  y: number;
  rotate: number;
}

/** Letters of `text` along the ring, centered at the top or the bottom. */
export function dotRingLetters(
  text: string,
  options: {
    fontSize: number;
    letterSpacing: number;
    position: "top" | "bottom";
    rotation: number;
  }
): RingLetter[] {
  const { fontSize, letterSpacing, position, rotation } = options;
  const circumference = 2 * Math.PI * TEXT_PATH_RADIUS;
  // Keep the letters that fit around the ring
  const kept: { char: string; along: number }[] = [];
  let offset = 0;
  for (const char of cleanText(text)) {
    const width = letterWidth(char, fontSize);
    if (offset + width > circumference) {
      break;
    }
    kept.push({ char, along: offset + width / 2 });
    offset += width + letterSpacing;
  }
  const total = offset - (kept.length > 0 ? letterSpacing : 0);
  const top = position !== "bottom";
  // Baseline: the letters' band centered on TEXT_BAND_RADIUS, rising
  // outwards at the top and inwards at the bottom
  const radius = top
    ? TEXT_BAND_RADIUS - HALF_CAP * fontSize
    : TEXT_BAND_RADIUS + HALF_CAP * fontSize;
  const half = (total / circumference) * 180;
  const letters: RingLetter[] = [];
  for (const { char, along } of kept) {
    if (char.trim() === "") {
      continue;
    }
    const step = (along / circumference) * 360;
    // Degrees clockwise from twelve o'clock
    const angle = top ? rotation - half + step : rotation + 180 + half - step;
    const radians = (angle * Math.PI) / 180;
    letters.push({
      char,
      x: roundTo(CENTER + radius * Math.sin(radians)),
      y: roundTo(CENTER - radius * Math.cos(radians)),
      rotate: roundTo(top ? angle : angle - 180),
    });
  }
  return letters;
}
