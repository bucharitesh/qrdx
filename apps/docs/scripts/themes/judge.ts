// Hard filters for a QR theme, shared by the generator (generate.ts) and the
// built-in preset test (tests/themes/presets-scan.test.ts): contrast, a real
// render decoded by jsQR through a phone-camera model, and the product's own
// scan score. Runs in Node: getScanScore's canvas is the test rasterizer.
import {
  getQRAsSVGDataUri,
  getScanScore,
  type QRProps,
  type ScanScoreResult,
} from "qrdx";
import type { ColorConfig } from "qrdx/types";
import qrcodegen from "../../../../packages/qrdx/src/codegen";
import { ERROR_LEVEL_MAP } from "../../../../packages/qrdx/src/constants";
import { installFakeDom } from "../../../../packages/qrdx/tests/support/fake-dom";
import {
  decodeQR,
  rasterizeSvg,
  simulateCamera,
  svgFromDataUri,
} from "../../../../packages/qrdx/tests/support/raster";
import { contrastProblems } from "../../lib/themes/compose";
import { isInverted } from "../../lib/themes/color";
import type { ThemeStyles } from "../../types/theme";

/** What the playground's e2e suite and the scan-score tests encode. */
export const JUDGE_VALUE = "https://qrdx.dev/q/Ab3dE9x";
/** A longer, everyday URL (one or two QR versions up). */
export const LONG_VALUE = "https://qrdx.dev/menu/harbour-cafe?table=12&lang=en";
/** Code widths (px) every theme must decode at. */
export const DECODE_SIZES = [160, 320] as const;
export const MIN_SCAN_SCORE = 75;

export interface Verdict {
  pass: boolean;
  /** Why it failed (empty when it passed) */
  reasons: string[];
  inverted: boolean;
  /** Scan score with the decode sizes above (hard filter) */
  score: number;
  /** Scan score as the editor computes it (adds 96 px); null when skipped */
  editorScore: number | null;
  /** Failed scan-score checks, for the soft score and the report */
  warnings: string[];
}

/** Props the playground renders for a style (see components/editor/scan-score.tsx). */
export function toQRProps(styles: ThemeStyles, value = JUDGE_VALUE): QRProps {
  return {
    value,
    size: 256,
    bgColor: styles.bgColor,
    fgColor: styles.fgColor,
    eyeColor: styles.eyeColor,
    dotColor: styles.dotColor,
    bodyPattern: styles.bodyPattern,
    cornerEyePattern: styles.cornerEyePattern,
    cornerEyeDotPattern: styles.cornerEyeDotPattern,
    level: styles.level,
    margin: styles.margin,
    templateId: styles.templateId,
    ...(styles.frame && { frame: styles.frame }),
  } as QRProps;
}

const stopAt = (color: ColorConfig | undefined, index: number) =>
  color && typeof color !== "string" && color.type !== "solid"
    ? (color.stops[Math.min(index, color.stops.length - 1)]?.color ?? color)
    : color;

/**
 * The test rasterizer paints a gradient with its first stop, so a gradient
 * theme is decoded once per stop with every gradient flattened to that stop.
 */
export function solidVariants(props: QRProps): QRProps[] {
  const gradients = [props.fgColor, props.eyeColor, props.dotColor].filter(
    (color) => color && typeof color !== "string" && color.type !== "solid",
  ) as { stops: unknown[] }[];
  const count = Math.max(1, ...gradients.map((g) => g.stops.length));
  if (gradients.length === 0) return [props];
  return Array.from({ length: count }, (_, index) => ({
    ...props,
    fgColor: stopAt(props.fgColor, index),
    eyeColor: stopAt(props.eyeColor, index),
    dotColor: stopAt(props.dotColor, index),
  }));
}

/**
 * Renders `props` with the real renderer, rasterizes the code `codeWidth` px
 * wide on white paper, blurs it like a phone camera and decodes it.
 */
export async function decodesAt(
  props: QRProps,
  codeWidth: number,
): Promise<boolean> {
  const uri = await getQRAsSVGDataUri({ ...props, size: codeWidth });
  const svg = svgFromDataUri(uri);
  if (!svg) return false;
  const symbol = qrcodegen.QrCode.encodeText(
    props.value,
    ERROR_LEVEL_MAP[props.level ?? "Q"],
  ).size;
  const modulePx = codeWidth / (symbol + 2 * (props.margin ?? 0));
  const image = rasterizeSvg(svg, {
    pad: Math.max(8, Math.round(codeWidth * 0.12)),
    background: "#ffffff",
  });
  return decodeQR(simulateCamera(image, modulePx)) === props.value;
}

let domInstalled = false;
function ensureDom() {
  if (domInstalled) return;
  installFakeDom();
  domInstalled = true;
}

const failedChecks = (result: ScanScoreResult) =>
  result.checks.filter((check) => !check.passed).map((check) => check.id);

/**
 * Runs every hard filter on a theme. `editorScore` also scores it the way the
 * editor's badge does (informational, slower).
 */
export async function judgeTheme(
  styles: ThemeStyles,
  { editorScore = true }: { editorScore?: boolean } = {},
): Promise<Verdict> {
  ensureDom();
  const reasons = contrastProblems(styles).map((p) => `low contrast: ${p}`);
  const inverted = isInverted(styles.fgColor, styles.bgColor);
  const props = toQRProps(styles);
  const variants = solidVariants(props);

  for (const size of DECODE_SIZES) {
    for (const [index, variant] of variants.entries()) {
      if (!(await decodesAt(variant, size))) {
        reasons.push(
          `no decode at ${size} px${variants.length > 1 ? ` (gradient stop ${index + 1})` : ""}`,
        );
      }
    }
  }
  for (const variant of solidVariants(toQRProps(styles, LONG_VALUE))) {
    if (!(await decodesAt(variant, 320))) {
      reasons.push("no decode at 320 px with a longer URL");
      break;
    }
  }

  let score = 100;
  const warnings = new Set<string>();
  for (const variant of variants) {
    const result = await getScanScore(variant, { sizes: [...DECODE_SIZES] });
    score = Math.min(score, result.score);
    for (const id of failedChecks(result)) warnings.add(id);
  }
  if (score < MIN_SCAN_SCORE) {
    reasons.push(
      `scan score ${score} < ${MIN_SCAN_SCORE} (${[...warnings].join(", ")})`,
    );
  }
  const editor = editorScore
    ? (await getScanScore(variants[0] as QRProps)).score
    : null;

  return {
    pass: reasons.length === 0,
    reasons,
    inverted,
    score,
    editorScore: editor,
    warnings: [...warnings],
  };
}
