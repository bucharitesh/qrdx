// The engine's templates in the editor: frames like the others, tiles in
// the one frame picker. A design keeps a template as `templateId`, as saved
// designs, links, the image API (`template=`), the CLI (`--template`) and
// the MCP tools hold it: the engine draws it from its frame spec at the
// template's own size (the whole artwork is the chosen size). Picking any
// frame, template or shaped code replaces the one before.
import {
  type AnyQRFrame,
  BUILT_IN_FRAMES,
  getAllTemplates,
  getTemplate,
  type TemplateDefinition,
} from "qrdx";
import type { QRStyle } from "@/types/theme";
import { carryFrameSettings } from "./frame-specs";

/** Picker id prefix of a template tile. */
export const TEMPLATE_PREFIX = "template:";

/**
 * The templates the picker shows: every one but "default", which draws no
 * artwork (no frame is the None tile).
 */
export const FRAME_TEMPLATES: TemplateDefinition<Record<string, unknown>>[] = [
  // Once each: an alias id draws the same definition as its template
  ...new Map(
    getAllTemplates()
      .filter((template) => template.id !== "default")
      .map((template) => [template.id, template]),
  ).values(),
];

/**
 * The template a style draws, if it draws one with artwork (an alias id
 * finds its template).
 */
export function templateOf(
  style: Partial<QRStyle>,
): TemplateDefinition<Record<string, unknown>> | undefined {
  const template = style.templateId ? getTemplate(style.templateId) : undefined;
  return template && template.id !== "default" ? template : undefined;
}

/** `style` without a template. */
export function withoutTemplate<T extends Partial<QRStyle>>(style: T): T {
  if (style.templateId === undefined) return style;
  const { templateId: _templateId, ...rest } = style;
  return rest as T;
}

/**
 * Whether a template's artwork takes the code's dark color (it paints with
 * its spec's `frame` color; Striked Box and Halloween have colors of their
 * own).
 */
export function templateTakesCodeColor(
  template: TemplateDefinition<Record<string, unknown>>,
): boolean {
  const spec = template.spec;
  if (!spec) return false;
  return spec.shapes.some(
    (shape) =>
      shape.fill === "frame" ||
      ("stroke" in shape && shape.stroke?.color === "frame"),
  );
}

// ── The Classic frames, in picker order (for the cycle shortcut) ──────────

/** None, the built-in frames, then the templates (picker ids). */
export const CLASSIC_FRAME_IDS: string[] = [
  "none",
  ...BUILT_IN_FRAMES.map((frame) => frame.style),
  ...FRAME_TEMPLATES.map((template) => `${TEMPLATE_PREFIX}${template.id}`),
];

/** The Classic tile a style shows (null for other frames and shapes). */
export function classicFrameOf(style: Partial<QRStyle>): string | null {
  if (style.shape || style.silhouette) return null;
  const frame = style.frame;
  if (frame && frame.style !== "none") {
    return frame.style === "custom" ? null : frame.style;
  }
  const template = templateOf(style);
  return template ? `${TEMPLATE_PREFIX}${template.id}` : "none";
}

/**
 * `style` with the Classic tile `id` instead of its frame, template or
 * shaped code. A built-in frame keeps the text and colors chosen so far.
 */
export function withClassicFrame<T extends Partial<QRStyle>>(
  style: T,
  id: string,
): T {
  const { frame, shape: _shape, silhouette: _silhouette, ...rest } = style;
  const plain = withoutTemplate(rest as T);
  if (id.startsWith(TEMPLATE_PREFIX)) {
    return { ...plain, templateId: id.slice(TEMPLATE_PREFIX.length) };
  }
  if (id === "none") return { ...plain, frame: { style: "none" } };
  return {
    ...plain,
    frame: {
      ...(frame ? carryFrameSettings(frame) : {}),
      style: id,
    } as AnyQRFrame,
  };
}
