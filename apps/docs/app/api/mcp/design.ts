import "server-only";

import { getAllTemplates } from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
} from "qrdx/types";
import { z } from "zod";
import {
  contentCatalog,
  contentInputSchema,
  describeContent,
  validateDesignContent,
} from "@/lib/qr-design/content";
import {
  GREAT_SCORE,
  MAX_REPAIRS,
  runDesignLoop,
} from "@/lib/qr-design/repair";
import {
  DesignTooLongError,
  renderDesignPng,
  renderDesignSvg,
  scoreDesign,
} from "@/lib/qr-design/score";
import {
  CLASSIC_STYLE,
  type DesignStyle,
  designFrameSchema,
  designStyleSchema,
  ERROR_LEVELS,
  MARGIN_MAX,
  TEMPLATE_IDS,
  toThemeStyles,
} from "@/lib/qr-design/style";

// The MCP design_qr tool: the same content validation, style vocabulary and
// score-and-repair loop as the editor's AI chat, without a model on QRdx's
// side. The calling assistant chooses the style from list_options; QRdx
// validates it, scores it with the editor's scan score and repairs it to
// Great. Logos aren't offered here: the code is drawn without one.

export const DESIGN_SIZE_MIN = 128;
export const DESIGN_SIZE_MAX = 1024;

/** Every style option, all optional: missing ones get scannable defaults. */
const styleInputSchema = designStyleSchema
  .omit({ logo: true, frame: true })
  .partial()
  .extend({ frame: designFrameSchema.optional() })
  .describe(
    "How the code looks. Leave options out for defaults: eyes and eye centres follow the dot colour, square shapes, margin 4, level Q, no frame.",
  );

export const designQrInputSchema = z.object({
  content: contentInputSchema.describe(
    "What the code opens: a type and its fields (list_options lists the fields of every type)",
  ),
  style: styleInputSchema.optional(),
  size: z
    .number()
    .int()
    .min(DESIGN_SIZE_MIN)
    .max(DESIGN_SIZE_MAX)
    .default(512)
    .describe(
      `Width of the code in pixels (${DESIGN_SIZE_MIN}-${DESIGN_SIZE_MAX}); frames add to it`,
    ),
  include_svg: z
    .boolean()
    .default(true)
    .describe("Return the SVG markup (often 50-150 KB)"),
});

export type DesignQrInput = z.output<typeof designQrInputSchema>;

/** The requested style with defaults filled in. */
export function styleFromInput(style: DesignQrInput["style"]): DesignStyle {
  const fg = style?.fgColor ?? CLASSIC_STYLE.fgColor;
  return {
    ...CLASSIC_STYLE,
    ...style,
    fgColor: fg,
    eyeColor: style?.eyeColor ?? fg,
    dotColor: style?.dotColor ?? style?.eyeColor ?? fg,
    frame: style?.frame ?? CLASSIC_STYLE.frame,
    logo: "none",
  };
}

export type DesignQrResult =
  | {
      ok: true;
      summary: string;
      design: {
        content: ReturnType<typeof describeContent>;
        payload: string;
        style: DesignStyle;
        /** The style as QRdx saves it and the React component takes it */
        qrdxStyle: ReturnType<typeof toThemeStyles>;
        score: number;
        grade: string;
        great: boolean;
        stillFailing: { id: string; message: string; fix?: string }[];
        repairs: number;
        fellBack: boolean;
        changes: string[];
        attempts: { score: number; grade: string; by: string }[];
      };
      svg?: string;
      png: Uint8Array;
    }
  | { ok: false; message: string };

export async function designQr(input: DesignQrInput): Promise<DesignQrResult> {
  const content = validateDesignContent(input.content);
  if (!content.ok) {
    return {
      ok: false,
      message: `The ${input.content.type} content isn't valid: ${content.issues
        .map((issue) =>
          issue.field ? `${issue.field}: ${issue.message}` : issue.message,
        )
        .join("; ")}`,
    };
  }
  try {
    const result = await runDesignLoop({
      value: content.value,
      initial: styleFromInput(input.style),
      hasLogo: false,
      score: scoreDesign,
    });
    const qrdxStyle = toThemeStyles(result.style);
    const great = result.grade === "great";
    const summary = [
      `Scan score ${result.score}/100 (${result.grade})${
        result.repairs > 0
          ? ` after ${result.repairs} repair${result.repairs === 1 ? "" : "s"}${result.fellBack ? " and a fallback to a classic code" : ""}`
          : ""
      }.`,
      great
        ? ""
        : "It couldn't reach Great: the content is long. Shorten it or print the code bigger.",
      result.changes.length > 0
        ? `Changed to get there: ${result.changes.join("; ")}.`
        : "No changes were needed.",
      `Content: ${describeContent(content.content)} (${new TextEncoder().encode(content.value).length} bytes).`,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      ok: true,
      summary,
      design: {
        content: describeContent(content.content),
        payload: content.value,
        style: result.style,
        qrdxStyle,
        score: result.score,
        grade: result.grade,
        great,
        stillFailing: result.checks
          .filter((check) => !check.passed)
          .map(({ id, message, fix }) => ({
            id,
            message,
            ...(fix ? { fix } : {}),
          })),
        repairs: result.repairs,
        fellBack: result.fellBack,
        changes: result.changes,
        attempts: result.attempts.map(({ score, grade, by }) => ({
          score,
          grade,
          by,
        })),
      },
      ...(input.include_svg
        ? { svg: renderDesignSvg(content.value, qrdxStyle, input.size) }
        : {}),
      png: await renderDesignPng(content.value, qrdxStyle, input.size),
    };
  } catch (error) {
    if (error instanceof DesignTooLongError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/** Every value design_qr accepts, for the list_options tool. */
export function designOptions() {
  return {
    contentTypes: contentCatalog(),
    style: {
      colors:
        "#RRGGBB. bgColor (background), fgColor (dots), eyeColor (corner eyes), dotColor (eye centres). Every colour needs 4.5:1 contrast with the background to score Great; dark on light scans best.",
      gradients:
        "Optional, per part (body, background, eyes, eyeCentres): { type: linear | radial, from, to, angle (linear, 0-360) }.",
      bodyPatterns: BODY_PATTERN,
      eyes: CORNER_EYE_PATTERNS,
      eyeCentres: CORNER_EYE_DOT_PATTERNS,
      frames: {
        styles: FRAME_STYLES,
        textMaxLength: FRAME_TEXT_MAX_LENGTH,
        fields:
          "{ style, text, secondaryText (banner-top-bottom, circle, menu-card), color, textColor }",
      },
      templates: getAllTemplates()
        .filter((template) => TEMPLATE_IDS.includes(template.id))
        .map(({ id, name }) => ({
          id,
          name: id === "default" ? "None" : name,
        })),
      levels: ERROR_LEVELS.map((id) => ({
        id,
        recovery: { L: "~7%", M: "~15%", Q: "~25%", H: "~30%" }[id],
      })),
      margin: { min: 0, max: MARGIN_MAX, ideal: 4 },
      logos: "Not available over MCP; codes are drawn without a logo.",
    },
    size: { min: DESIGN_SIZE_MIN, max: DESIGN_SIZE_MAX, default: 512 },
    scanScore: {
      great: GREAT_SCORE,
      maxRepairs: MAX_REPAIRS,
      method:
        "The editor's scan score: the code is rendered, then decoded at 96, 160 and 320 px through a phone-camera model, plus contrast, quiet zone, eye shape, logo and shape-pair checks.",
    },
  };
}
