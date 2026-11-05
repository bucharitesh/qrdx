// A picture the user attached in the Generate tab, put into the code the ways
// the editor already does it without AI: the center logo, Logo QR or Image QR
// art, or an image fill for the background or the dots. Pure: the browser
// prepares the picture (attached-image.ts) and scores each attempt with the
// editor's own scan score; this module builds the style, repairs it toward
// Great like design_qr does, and says plainly what still fails.
import {
  getStylePairRisk,
  type ImageToneMap,
  type ScanCheck,
  type ScanGrade,
} from "qrdx";
import {
  type ColorConfig,
  getSolidColor,
  type ImagePaint,
  isImagePaint,
  type QRArtImage,
  type QRArtMode,
} from "qrdx/types";
import { artColorFix } from "@/components/editor/control-sections/art-colors";
import {
  recommendedSettings,
  withArtImage,
} from "@/components/editor/control-sections/art-controls";
import { DEFAULT_ART_STRENGTH } from "@/components/editor/control-sections/art-presets";
import type { ImagePlacement } from "@/lib/ai/agent/image-uses";
import { makeScannable } from "@/lib/paint/contrast";
import { withoutImageFills } from "@/lib/paint/image-fills";
import {
  type FailedCheck,
  isGreat,
  MAX_REPAIRS,
  type ScoreFn,
} from "@/lib/qr-design/repair";
import type { ThemeStyles } from "@/types/theme";

/** The picture, prepared in the browser for the placement it is used for. */
export interface PlacementAssets {
  /** The center logo: a data URL sized for logos */
  logo?: string;
  /** The art sample grid for Logo QR ("logo") or Image QR ("halftone") */
  art?: Partial<Record<QRArtMode, QRArtImage>>;
  /** An image fill's picture: a base64 data:image URL a saved design takes */
  picture?: string;
  /** The picture's tones, for the contrast fix ("Make it scannable") */
  tones?: ImageToneMap;
}

export interface Placed {
  style: ThemeStyles;
  /** What changed besides the picture itself, in plain words */
  changes: string[];
}

const ART_MODE: Record<"logo_qr" | "image_qr", QRArtMode> = {
  logo_qr: "logo",
  image_qr: "halftone",
};

/** Art strengths a repair steps down through (Balanced, then gentler). */
const ART_STEPS = [DEFAULT_ART_STRENGTH, 0.45, 0.35, 0.25];

const percent = (value: number) => `${Math.round(value * 100)}%`;

function needs<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`The picture has no ${what}`);
  return value;
}

/** An image fill from `src`, drawn over `underlay` where it is see-through. */
function pictureFill(src: string, underlay: string): ImagePaint {
  return {
    type: "image",
    src,
    fit: "cover",
    scale: 1,
    position: "center",
    opacity: 1,
    underlay,
  };
}

function withoutArt(style: ThemeStyles, changes: string[]): ThemeStyles {
  if (!style.art) return style;
  const { art: _art, ...rest } = style;
  changes.push("Turned off the Logo QR / Image QR art");
  return rest;
}

/** Code colors (dots, eyes, eye centers) that read on `background`. */
function readableCode(
  style: ThemeStyles,
  background: ColorConfig,
  changes: string[],
): ThemeStyles {
  const next = { ...style };
  const parts = [
    ["fgColor", "dots"],
    ["eyeColor", "corner eyes"],
    ["dotColor", "eye centers"],
  ] as const;
  for (const [key, name] of parts) {
    const paint = next[key];
    if (paint === undefined || isImagePaint(paint)) continue;
    const fixed = makeScannable("code", paint, {
      ...next,
      bgColor: background,
    });
    if (fixed && JSON.stringify(fixed) !== JSON.stringify(paint)) {
      next[key] = fixed;
      changes.push(`Darkened the ${name} so they read on the picture`);
    }
  }
  return next;
}

/** A picture background faded just enough for the code to read on it. */
function scannableBackground(
  style: ThemeStyles,
  paint: ImagePaint,
  tones: ImageToneMap | undefined,
  changes: string[],
): ThemeStyles {
  let next: ThemeStyles = { ...style, bgColor: paint };
  let fixed = makeScannable("background", paint, next, tones);
  if (!fixed) {
    // The code colors are too light for any picture: darken them first.
    next = readableCode(next, "#FFFFFF", changes);
    fixed = makeScannable("background", paint, next, tones);
  }
  if (fixed && isImagePaint(fixed)) {
    if ((fixed.opacity ?? 1) < (paint.opacity ?? 1)) {
      changes.push(
        `Faded the picture to ${percent(fixed.opacity ?? 1)} over white so the dots stand out`,
      );
    }
    next = { ...next, bgColor: fixed };
  }
  return next;
}

/** Picture dots darkened just enough to read on the background. */
function scannableDots(
  style: ThemeStyles,
  paint: ImagePaint,
  tones: ImageToneMap | undefined,
  changes: string[],
): ThemeStyles {
  const fixed = makeScannable("code", paint, style, tones);
  if (fixed && isImagePaint(fixed)) {
    if ((fixed.opacity ?? 1) < (paint.opacity ?? 1)) {
      changes.push(
        `Laid the picture over black at ${percent(fixed.opacity ?? 1)} so the dots stand out`,
      );
    }
    return { ...style, fgColor: fixed };
  }
  return { ...style, fgColor: paint };
}

/**
 * `style` with the picture in `placement`, plus what that needs to scan:
 * error correction H for a logo or art, the art's colors and margin, and
 * the "Make it scannable" contrast fix for an image fill.
 */
export function placeImage(
  style: ThemeStyles,
  placement: ImagePlacement,
  assets: PlacementAssets,
): Placed {
  const changes: string[] = [];
  switch (placement) {
    case "logo": {
      const next: ThemeStyles = {
        ...style,
        showLogo: true,
        customLogo: needs(assets.logo, "logo"),
      };
      if (style.level !== "H") {
        changes.push(
          "Raised error correction to H so the logo doesn't hide data",
        );
        next.level = "H";
      }
      return { style: next, changes };
    }
    case "logo_qr":
    case "image_qr": {
      const mode = ART_MODE[placement];
      const image = needs(assets.art?.[mode], "art sample");
      let base = withoutImageFills(style);
      if (base !== style) {
        changes.push("Swapped the picture fills for solid colors for the art");
      }
      const recommended = recommendedSettings(base);
      if (recommended.level) {
        changes.push("Raised error correction to H so the art scans");
      }
      if (recommended.margin !== undefined) {
        changes.push(
          `Widened the margin to ${recommended.margin} modules so the art scans`,
        );
      }
      const fix = artColorFix(base);
      if (fix) {
        base = { ...base, ...fix } as ThemeStyles;
        changes.push(
          "Put dark dots on a light background: art needs that to show",
        );
      }
      return {
        style: withArtImage(base, image, mode, DEFAULT_ART_STRENGTH),
        changes,
      };
    }
    case "background": {
      const base = withoutArt(style, changes);
      const paint = pictureFill(needs(assets.picture, "picture"), "#ffffff");
      return {
        style: scannableBackground(base, paint, assets.tones, changes),
        changes,
      };
    }
    case "dots": {
      const base = withoutArt(style, changes);
      // The eyes stay solid (they fall back to the dots' color otherwise):
      // phones lock on to them first.
      const solid = getSolidColor(base.fgColor, "#000000");
      const eyes: ThemeStyles = {
        ...base,
        eyeColor: base.eyeColor ?? solid,
        dotColor: base.dotColor ?? solid,
      };
      const paint = pictureFill(needs(assets.picture, "picture"), "#000000");
      return {
        style: scannableDots(eyes, paint, assets.tones, changes),
        changes,
      };
    }
  }
}

// ── Repairs ────────────────────────────────────────────────────────────────

const SOLID_BODIES = new Set(["square", "rounded", "classy", "classy-rounded"]);

/** A picture fill faded `factor` further (background) or darker (dots). */
function fadeFill(
  paint: ColorConfig | undefined,
  factor: number,
): ImagePaint | null {
  if (!isImagePaint(paint)) return null;
  const opacity = Math.round((paint.opacity ?? 1) * factor * 100) / 100;
  return opacity < 0.15 ? null : { ...paint, opacity };
}

/**
 * One round of fixes for the checks that failed, aimed at the placement:
 * gentler art, a fainter picture, error correction, margin and shapes.
 * No changes means there is nothing left to try.
 */
export function repairPlacement(
  style: ThemeStyles,
  placement: ImagePlacement,
  failed: FailedCheck[],
): Placed {
  const ids = new Set(failed.map((check) => check.id));
  const decode = [...ids].some((id) => id.startsWith("decode"));
  const changes: string[] = [];
  const next: ThemeStyles = { ...style };

  if (ids.has("quiet-zone") && (next.margin ?? 0) < 4) {
    changes.push(
      `Widened the margin from ${next.margin ?? 0} to 4 modules (the quiet zone)`,
    );
    next.margin = 4;
  }
  if (ids.has("eye-shape") && next.cornerEyePattern !== "rounded") {
    changes.push(
      "Changed the eyes to rounded: strict scanners miss the other shape",
    );
    next.cornerEyePattern = "rounded";
  }
  if (ids.has("style-pair")) {
    const risk = getStylePairRisk(next);
    if (risk?.kind === "body-eye") {
      changes.push(`Changed the dots to rounded: ${risk.message}`);
      next.bodyPattern = "rounded";
    } else if (risk) {
      changes.push(`Changed the eye centers to rounded: ${risk.message}`);
      next.cornerEyeDotPattern = "rounded";
    }
  }
  if (ids.has("logo")) {
    if (next.level !== "H") {
      changes.push(
        "Raised error correction to H so the logo doesn't hide data",
      );
      next.level = "H";
    } else if (placement === "logo") {
      const size = next.logoOptions?.size ?? 0.25;
      if (size > 0.12) {
        const smaller = Math.max(0.1, Math.round(size * 0.8 * 100) / 100);
        changes.push(`Made the logo smaller (${percent(smaller)} of the code)`);
        next.logoOptions = { ...next.logoOptions, size: smaller };
      }
    } else if (next.showLogo) {
      changes.push("Removed the center logo: it covered too much of the code");
      next.showLogo = false;
    }
  }

  const contrast = ids.has("contrast") || ids.has("polarity");
  if (contrast || decode) {
    if (placement === "logo_qr" || placement === "image_qr") {
      const art = next.art;
      const current = art?.intensity ?? DEFAULT_ART_STRENGTH;
      const gentler = ART_STEPS.find((step) => step < current - 0.001);
      if (art && gentler !== undefined) {
        changes.push(
          `Toned the art down to ${percent(gentler)} so the code reads`,
        );
        next.art = { ...art, intensity: gentler };
      }
    } else if (placement === "background") {
      const faded = fadeFill(next.bgColor, 0.7);
      if (faded) {
        changes.push(
          `Faded the picture to ${percent(faded.opacity ?? 1)} so the dots stand out`,
        );
        next.bgColor = faded;
      }
    } else if (placement === "dots") {
      const darker = fadeFill(next.fgColor, 0.7);
      if (darker) {
        changes.push(
          `Darkened the picture in the dots (${percent(darker.opacity ?? 1)}) so they stand out`,
        );
        next.fgColor = darker;
      }
    }
  }
  if (decode && placement !== "logo_qr" && placement !== "image_qr") {
    if (!SOLID_BODIES.has(next.bodyPattern ?? "circle")) {
      changes.push(
        "Changed the dots to rounded squares so the code reads when it's small",
      );
      next.bodyPattern = "rounded";
    }
  }
  return { style: next, changes };
}

// ── The loop ───────────────────────────────────────────────────────────────

export interface PlacementAttempt {
  score: number;
  grade: ScanGrade;
  /** What this attempt changed from the one before */
  changes: string[];
}

export interface PlacementResult {
  style: ThemeStyles;
  score: number;
  grade: ScanGrade;
  /** Checks the result still fails, with their fixes */
  failed: FailedCheck[];
  /** Everything changed besides the picture, up to the result */
  changes: string[];
  repairs: number;
  attempts: PlacementAttempt[];
}

const failedChecks = (checks: ScanCheck[]): FailedCheck[] =>
  checks
    .filter((check) => !check.passed)
    .map(({ id, message, fix }) => ({ id, message, ...(fix ? { fix } : {}) }));

/**
 * Places the picture, scores it with the editor's scan score and repairs it
 * (at most MAX_REPAIRS times) until it is Great. The best attempt wins when
 * none gets there; its failed checks say why.
 */
export async function runPlacementLoop({
  value,
  style,
  placement,
  assets,
  score,
  onAttempt,
}: {
  /** The encoded content the code holds */
  value: string;
  style: ThemeStyles;
  placement: ImagePlacement;
  assets: PlacementAssets;
  score: ScoreFn;
  onAttempt?: (attempt: PlacementAttempt, index: number) => void;
}): Promise<PlacementResult> {
  const placed = placeImage(style, placement, assets);
  let current = placed.style;
  let changes = placed.changes;
  let result = await score(value, current);
  const attempts: PlacementAttempt[] = [
    { score: result.score, grade: result.grade, changes: placed.changes },
  ];
  onAttempt?.(attempts[0] as PlacementAttempt, 0);
  let best = {
    style: current,
    result,
    changes,
    repairs: 0,
  };

  let repairs = 0;
  while (!isGreat(result) && repairs < MAX_REPAIRS) {
    const fix = repairPlacement(
      current,
      placement,
      failedChecks(result.checks),
    );
    if (fix.changes.length === 0) break;
    repairs++;
    current = fix.style;
    changes = [...changes, ...fix.changes];
    result = await score(value, current);
    const attempt = {
      score: result.score,
      grade: result.grade,
      changes: fix.changes,
    };
    attempts.push(attempt);
    onAttempt?.(attempt, attempts.length - 1);
    if (result.score > best.result.score || isGreat(result)) {
      best = { style: current, result, changes, repairs };
    }
  }

  return {
    style: best.style,
    score: best.result.score,
    grade: best.result.grade,
    failed: failedChecks(best.result.checks),
    changes: best.changes,
    repairs: best.repairs,
    attempts,
  };
}

/** Other placements to offer when one can't reach Great, best first. */
export function alternativesFor(placement: ImagePlacement): ImagePlacement[] {
  switch (placement) {
    case "logo":
      return ["logo_qr", "image_qr"];
    case "logo_qr":
      return ["logo", "image_qr"];
    case "image_qr":
      return ["logo", "background"];
    case "background":
    case "dots":
      return ["image_qr", "logo"];
  }
}
