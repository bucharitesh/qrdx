// The "good score, guaranteed" loop shared by the AI chat and the MCP
// `design_qr` tool: score a candidate with the editor's scan score, and while
// it is below Great, repair it (at most MAX_REPAIRS times), then fall back to
// a classic black-on-white code, which scores Great whenever the content
// allows it at all. Repairs are targeted at the checks that failed, so the
// look the user asked for changes as little as possible, and every change is
// recorded in plain words for the user.
import {
  getStylePairRisk,
  type ScanCheck,
  type ScanGrade,
  type ScanScoreResult,
} from "qrdx";
import { contrastRatio, luminance } from "@/lib/themes/color";
import type { ThemeStyles } from "@/types/theme";
import {
  CLASSIC_STYLE,
  type DesignStyle,
  HEX_COLOR,
  styleDiff,
  toThemeStyles,
} from "./style";

export const MAX_REPAIRS = 3;

/** The engine's "great" grade starts here (qrdx gradeFor). */
export const GREAT_SCORE = 85;

export interface FailedCheck {
  id: string;
  message: string;
  fix?: string;
}

export interface DesignAttempt {
  style: DesignStyle;
  score: number;
  grade: ScanGrade;
  failed: FailedCheck[];
  /** What changed from the attempt before, in plain words */
  changes: string[];
  /** Who made this attempt */
  by: "initial" | "model" | "repair" | "fallback";
}

export interface DesignLoopResult {
  style: DesignStyle;
  score: number;
  grade: ScanGrade;
  checks: ScanCheck[];
  attempts: DesignAttempt[];
  /** Repairs made after the first candidate (at most MAX_REPAIRS) */
  repairs: number;
  /** The result is the classic fallback, the repairs couldn't reach Great */
  fellBack: boolean;
  /** Every change from the first candidate to the result, for the user */
  changes: string[];
}

export type ScoreFn = (
  value: string,
  style: ThemeStyles,
) => Promise<ScanScoreResult>;

/** Asks a model for a revised style that fixes `failed` (the chat's Gemini). */
export type ReviseFn = (
  style: DesignStyle,
  failed: FailedCheck[],
  score: number,
) => Promise<DesignStyle>;

export const isGreat = (result: Pick<ScanScoreResult, "grade">) =>
  result.grade === "great";

const failedChecks = (result: ScanScoreResult): FailedCheck[] =>
  result.checks
    .filter((check) => !check.passed)
    .map(({ id, message, fix }) => ({ id, message, ...(fix ? { fix } : {}) }));

const same = (a: DesignStyle, b: DesignStyle) =>
  JSON.stringify(a) === JSON.stringify(b);

// ── Normalising ────────────────────────────────────────────────────────────

/**
 * Makes a candidate safe to render: upper-case colours, "keep" only when
 * there is a logo to keep, and no shape pair the editor blocks (pairs that
 * fail the engine's decode tests can't be picked together there either).
 */
export function normalizeDesign(
  style: DesignStyle,
  { hasLogo }: { hasLogo: boolean },
): { style: DesignStyle; changes: string[] } {
  const changes: string[] = [];
  const next: DesignStyle = {
    ...style,
    bgColor: style.bgColor.toUpperCase(),
    fgColor: style.fgColor.toUpperCase(),
    eyeColor: style.eyeColor.toUpperCase(),
    dotColor: style.dotColor.toUpperCase(),
    frame:
      style.frame.style === "none"
        ? { style: "none" }
        : {
            ...style.frame,
            ...(style.frame.text !== undefined
              ? { text: style.frame.text.trim() }
              : {}),
          },
  };
  if (next.logo === "keep" && !hasLogo) next.logo = "none";
  const risk = getStylePairRisk(next);
  if (risk?.kind === "dot-eye") {
    changes.push(
      `Changed the eye centres from ${next.cornerEyeDotPattern} to rounded: ${risk.message}`,
    );
    next.cornerEyeDotPattern = "rounded";
  } else if (risk?.kind === "body-eye") {
    changes.push(
      `Changed the eyes from ${next.cornerEyePattern} to extra-rounded: ${risk.message}`,
    );
    next.cornerEyePattern = "extra-rounded";
  }
  return { style: next, changes };
}

// ── Targeted repairs ───────────────────────────────────────────────────────

const MIN_CONTRAST = 4.5;

function mix(color: string, target: string, amount: number) {
  const channel = (hex: string, i: number) =>
    Number.parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(channel(color, i) * (1 - amount) + channel(target, i) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

/** The background colours a style paints (its gradient stops, if any). */
const backgrounds = (style: DesignStyle) =>
  style.gradients?.background
    ? [style.gradients.background.from, style.gradients.background.to]
    : [style.bgColor];

const lightBackground = (style: DesignStyle) =>
  (luminance(backgrounds(style)[0] as string) ?? 1) > 0.18;

/**
 * Keeps the hue but darkens (light backgrounds) or lightens (dark ones) a
 * colour just enough to reach 4.5:1 against every background colour.
 */
function readable(
  color: string,
  style: DesignStyle,
  min = MIN_CONTRAST,
): string {
  const grounds = backgrounds(style);
  const ok = (candidate: string) =>
    grounds.every((ground) => contrastRatio(candidate, ground) >= min);
  if (ok(color)) return color;
  const target = lightBackground(style) ? "#000000" : "#FFFFFF";
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(color, target, step / 20);
    if (ok(candidate)) return candidate;
  }
  return target;
}

/**
 * Contrast that still reads small, through blur and a phone camera's
 * contrast loss: 4.5:1 passes the contrast check but can fail to decode at
 * 96 px; dark on light at 7:1 reads there.
 */
const STRONG_CONTRAST = 7;

function fixContrast(
  style: DesignStyle,
  changes: string[],
  { min = MIN_CONTRAST, reason = "for contrast" } = {},
): DesignStyle {
  const next: DesignStyle = { ...style };
  // A mid-tone background gradient can't contrast with anything; flatten it.
  if (next.gradients?.background && min === MIN_CONTRAST) {
    const { from, to } = next.gradients.background;
    const flat = lightBackground(next)
      ? (luminance(from) ?? 0) > (luminance(to) ?? 0)
        ? from
        : to
      : (luminance(from) ?? 0) < (luminance(to) ?? 0)
        ? from
        : to;
    const { background: _background, ...rest } = next.gradients;
    next.gradients = rest;
    next.bgColor = flat.toUpperCase();
    changes.push(
      `Made the background solid ${next.bgColor} so the code has steady contrast`,
    );
  }
  const parts = [
    ["fgColor", "dots", "body"],
    ["eyeColor", "corner eyes", "eyes"],
    ["dotColor", "eye centres", "eyeCentres"],
  ] as const;
  for (const [key, name, gradientKey] of parts) {
    const fixed = readable(next[key], next, min);
    if (fixed !== next[key]) {
      changes.push(
        `${lightBackground(next) ? "Darkened" : "Lightened"} the ${name} (${next[key]} → ${fixed}) ${reason}`,
      );
      next[key] = fixed;
    }
    const gradient = next.gradients?.[gradientKey];
    if (gradient) {
      const from = readable(gradient.from, next, min);
      const to = readable(gradient.to, next, min);
      if (from !== gradient.from || to !== gradient.to) {
        next.gradients = {
          ...next.gradients,
          [gradientKey]: { ...gradient, from, to },
        };
        changes.push(`Adjusted the ${name} gradient ${reason}`);
      }
    }
  }
  return next;
}

/** Bodies with full, evenly spaced modules: they read best when small. */
const SOLID_BODIES = new Set(["square", "rounded", "classy", "classy-rounded"]);

/**
 * One round of targeted fixes for the checks that failed. `final` allows the
 * bigger changes (light-on-dark codes become dark-on-light).
 */
export function repairDesign(
  style: DesignStyle,
  failed: FailedCheck[],
  { final = false }: { final?: boolean } = {},
): { style: DesignStyle; changes: string[] } {
  const ids = new Set(failed.map((check) => check.id));
  const changes: string[] = [];
  let next: DesignStyle = { ...style };

  if (ids.has("polarity") && final) {
    const dark = [next.fgColor, next.eyeColor, next.dotColor];
    next = {
      ...next,
      bgColor: "#FFFFFF",
      fgColor: "#111111",
      eyeColor: "#111111",
      dotColor: "#111111",
    };
    const { gradients } = next;
    if (gradients) {
      const { background: _background, ...rest } = gradients;
      next.gradients = rest;
    }
    changes.push(
      `Switched to dark dots on a white background (from ${dark[0]} on ${style.bgColor}): some scanner apps can't read light codes`,
    );
  }
  if (ids.has("contrast") || (ids.has("polarity") && final)) {
    next = fixContrast(next, changes);
  }
  if (ids.has("logo")) {
    if (next.level !== "H") {
      changes.push(
        `Raised error correction from ${next.level} to H so the logo doesn't hide data`,
      );
      next.level = "H";
    } else {
      changes.push("Removed the logo: it covered too much of the code");
      next.logo = "none";
    }
  }
  if (ids.has("quiet-zone")) {
    changes.push(
      `Widened the margin from ${next.margin} to 4 modules (the quiet zone)`,
    );
    next.margin = 4;
  }
  if (ids.has("eye-shape")) {
    changes.push(
      `Changed the eyes from ${next.cornerEyePattern} to rounded: strict scanners miss them`,
    );
    next.cornerEyePattern = "rounded";
  }
  if (ids.has("style-pair")) {
    const risk = getStylePairRisk(next);
    if (risk?.kind === "dot" || risk?.kind === "dot-eye") {
      changes.push(
        `Changed the eye centres from ${next.cornerEyeDotPattern} to rounded: ${risk.message}`,
      );
      next.cornerEyeDotPattern = "rounded";
    } else if (risk?.kind === "body-eye") {
      changes.push(
        `Changed the dots from ${next.bodyPattern} to rounded: ${risk.message}`,
      );
      next.bodyPattern = "rounded";
    }
  }
  const decodeFailed = [...ids].some((id) => id.startsWith("decode-"));
  if (decodeFailed) {
    // Low contrast that passes the check can still blur away when small.
    next = fixContrast(next, changes, {
      min: STRONG_CONTRAST,
      reason: "so it reads at small sizes",
    });
    // Long content means many small modules: less error correction holds it
    // in fewer, bigger ones, which helps most. A logo needs the correction.
    if (next.logo === "none" && (next.level === "Q" || next.level === "H")) {
      changes.push(
        `Lowered error correction from ${next.level} to M for fewer, bigger modules`,
      );
      next.level = "M";
    } else if (final && next.logo === "none" && next.level === "M") {
      changes.push("Lowered error correction from M to L for bigger modules");
      next.level = "L";
    }
    if (final && next.bodyPattern !== "square") {
      changes.push(
        `Changed the dots from ${next.bodyPattern} to squares so the code reads when it's small`,
      );
      next.bodyPattern = "square";
    } else if (!SOLID_BODIES.has(next.bodyPattern)) {
      changes.push(
        `Changed the dots from ${next.bodyPattern} to rounded squares so the code reads when it's small`,
      );
      next.bodyPattern = "rounded";
    }
    if (
      final &&
      (next.cornerEyePattern !== "square" ||
        next.cornerEyeDotPattern !== "square")
    ) {
      changes.push("Squared the corner eyes so phones lock on faster");
      next.cornerEyePattern = "square";
      next.cornerEyeDotPattern = "square";
    }
  }
  return { style: next, changes };
}

/**
 * Classic variants to fall back to, best first: black on white with square
 * modules, keeping the frame label. Lower levels hold long content in fewer,
 * bigger modules.
 */
function fallbacks(style: DesignStyle): DesignStyle[] {
  const frame: DesignStyle["frame"] =
    style.frame.style === "none"
      ? { style: "none" }
      : {
          style: style.frame.style,
          ...(style.frame.text ? { text: style.frame.text } : {}),
          ...(style.frame.secondaryText
            ? { secondaryText: style.frame.secondaryText }
            : {}),
        };
  return (["Q", "M", "L"] as const).map((level) => ({
    ...CLASSIC_STYLE,
    level,
    frame,
  }));
}

// ── The loop ───────────────────────────────────────────────────────────────

export interface DesignLoopOptions {
  /** The encoded content the code holds */
  value: string;
  initial: DesignStyle;
  /** Whether the code shows a logo now (for "keep") */
  hasLogo: boolean;
  score: ScoreFn;
  /** Model revision for the first repairs; deterministic repairs without it */
  revise?: ReviseFn;
  maxRepairs?: number;
  /** Called after every scored attempt (for progress in the chat) */
  onAttempt?: (attempt: DesignAttempt, index: number) => void;
}

/**
 * Scores the candidate and repairs it until it is Great: up to
 * `maxRepairs` repairs (model revisions first when `revise` is given, the
 * last one deterministic), then the classic fallback.
 */
export async function runDesignLoop({
  value,
  initial,
  hasLogo,
  score,
  revise,
  maxRepairs = MAX_REPAIRS,
  onAttempt,
}: DesignLoopOptions): Promise<DesignLoopResult> {
  const attempts: DesignAttempt[] = [];
  const results: ScanScoreResult[] = [];
  /** The attempt each one was made from (-1 for the first). */
  const parents: number[] = [];

  const record = async (
    style: DesignStyle,
    changes: string[],
    by: DesignAttempt["by"],
    parent: number,
  ) => {
    const result = await score(value, toThemeStyles(style));
    const attempt: DesignAttempt = {
      style,
      score: result.score,
      grade: result.grade,
      failed: failedChecks(result),
      changes,
      by,
    };
    attempts.push(attempt);
    results.push(result);
    parents.push(parent);
    onAttempt?.(attempt, attempts.length - 1);
    return attempt;
  };

  const first = normalizeDesign(initial, { hasLogo });
  await record(first.style, first.changes, "initial", -1);

  /**
   * The best attempt so far. Repairs build on the latest of equal scores, so
   * each one tries something new; the result is the earliest of equals, the
   * one with the fewest changes.
   */
  const best = ({ latest = false } = {}) =>
    attempts.reduce((top, attempt, index) => {
      const topScore = (attempts[top] as DesignAttempt).score;
      return attempt.score > topScore || (latest && attempt.score === topScore)
        ? index
        : top;
    }, 0);

  let repairs = 0;
  while (repairs < maxRepairs && !isGreat(attempts[best()] as DesignAttempt)) {
    repairs++;
    const parent = best({ latest: true });
    const base = attempts[parent] as DesignAttempt;
    const final = repairs === maxRepairs;
    let next: DesignStyle | null = null;
    let changes: string[] = [];
    let by: DesignAttempt["by"] = "repair";

    if (revise && !final) {
      try {
        const revised = normalizeDesign(
          await revise(base.style, base.failed, base.score),
          { hasLogo },
        );
        if (!same(revised.style, base.style)) {
          next = revised.style;
          changes = [
            ...styleDiff(base.style, revised.style).map((change) =>
              change.from
                ? `${capitalize(change.label)}: ${change.from} → ${change.to}`
                : `${capitalize(change.label)}: ${change.to}`,
            ),
            ...revised.changes,
          ];
          by = "model";
        }
      } catch {
        // A failed revision falls through to the deterministic repair.
      }
    }
    if (!next) {
      let repaired = repairDesign(base.style, base.failed, { final });
      // Nothing small left to try: make the bigger changes now.
      if (!final && same(repaired.style, base.style)) {
        repaired = repairDesign(base.style, base.failed, { final: true });
      }
      if (same(repaired.style, base.style)) break;
      next = repaired.style;
      changes = repaired.changes;
    }
    await record(next, changes, by, parent);
  }

  if (!isGreat(attempts[best()] as DesignAttempt)) {
    const parent = best();
    const base = attempts[parent] as DesignAttempt;
    for (const fallback of fallbacks(base.style)) {
      const attempt = await record(
        fallback,
        [
          `Fell back to a classic black-on-white code (error correction ${fallback.level}): the design couldn't reach Great`,
        ],
        "fallback",
        parent,
      );
      if (isGreat(attempt)) break;
    }
  }

  const index = best();
  const result = attempts[index] as DesignAttempt;
  const fellBack = result.by === "fallback";
  // The changes along the path from the first candidate to the result; a
  // fallback replaces the whole look, so only its own change is true of it.
  const path: number[] = [];
  for (let at = index; at >= 0; at = parents[at] as number) path.unshift(at);
  const changes = fellBack
    ? result.changes
    : path.flatMap((at) => (attempts[at] as DesignAttempt).changes);
  return {
    style: result.style,
    score: result.score,
    grade: result.grade,
    checks: (results[index] as ScanScoreResult).checks,
    attempts,
    repairs,
    fellBack,
    changes,
  };
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export const isHexColor = (value: string) => HEX_COLOR.test(value);
