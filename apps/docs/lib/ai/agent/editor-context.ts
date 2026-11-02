// The code in the user's editor, sent with every chat request so "make it
// darker" and "add a frame" start from what is on screen. QRdx's server uses
// the content to score designs; the model only sees the content type and the
// style, never the content's values (a Wi-Fi password, a phone number).
import { colorConfigSchema, frameSchema } from "qrdx/types";
import { z } from "zod";
import {
  CONTENT_TYPE_IDS,
  contentTypeLabel,
  validateDesignContent,
} from "@/lib/qr-design/content";
import { type DesignStyle, fromThemeStyles } from "@/lib/qr-design/style";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";

/** Largest logo the client sends along (an uploaded image as a data URL). */
export const MAX_CONTEXT_LOGO_LENGTH = 200_000;

/** Payload limit of a QR code, with room for escaping. */
const MAX_VALUE_LENGTH = 4096;

const styleSchema = z
  .looseObject({
    bgColor: colorConfigSchema.optional(),
    fgColor: colorConfigSchema.optional(),
    eyeColor: colorConfigSchema.optional(),
    dotColor: colorConfigSchema.optional(),
    bodyPattern: z.string().max(40).optional(),
    cornerEyePattern: z.string().max(40).optional(),
    cornerEyeDotPattern: z.string().max(40).optional(),
    level: z.string().max(2).optional(),
    margin: z.number().min(0).max(64).optional(),
    templateId: z.string().max(64).optional(),
    frame: frameSchema.optional(),
    showLogo: z.boolean().optional(),
  })
  .transform(
    // Only what a design is built from: no art images or other extras.
    ({
      bgColor,
      fgColor,
      eyeColor,
      dotColor,
      bodyPattern,
      cornerEyePattern,
      cornerEyeDotPattern,
      level,
      margin,
      templateId,
      frame,
      showLogo,
    }) =>
      ({
        bgColor,
        fgColor,
        eyeColor,
        dotColor,
        bodyPattern,
        cornerEyePattern,
        cornerEyeDotPattern,
        level,
        margin,
        templateId,
        frame,
        showLogo,
      }) as ThemeStyles,
  );

export const editorContextSchema = z.object({
  contentType: z.enum(CONTENT_TYPE_IDS),
  /** The content form's fields for that type */
  content: z.record(z.string(), z.unknown()).optional(),
  /** The encoded payload the preview shows (a short link for dynamic codes) */
  value: z.string().max(MAX_VALUE_LENGTH),
  style: styleSchema,
  /** The logo image when the code shows one (left out when too large) */
  customLogo: z.string().max(MAX_CONTEXT_LOGO_LENGTH).optional(),
  /** Logo QR / Image QR art is on (AI designs replace it) */
  hasArt: z.boolean().default(false),
});

export type EditorContextInput = z.input<typeof editorContextSchema>;
export type EditorContext = z.output<typeof editorContextSchema>;

/** A typical short link, scored when the editor has no content yet. */
export const SAMPLE_VALUE = "https://qrdx.dev/q/Ab3dE9x";

export interface EditorBase {
  contentType: ContentType;
  /** The editor's content, when its form is valid */
  content: QRContentConfig | null;
  /** What designs are scored with until the chat sets new content */
  value: string;
  valueIsSample: boolean;
  /** The look as a design (what design_qr starts from) */
  style: DesignStyle;
  /** The editor's own styles, as sent (what check_scan_score scores) */
  rawStyle: ThemeStyles;
  hasLogo: boolean;
  customLogo?: string;
  hasArt: boolean;
}

export function editorBase(context: EditorContext | undefined): EditorBase {
  if (!context) {
    return {
      contentType: "url",
      content: null,
      value: SAMPLE_VALUE,
      valueIsSample: true,
      style: fromThemeStyles({}, { showLogo: false }),
      rawStyle: {},
      hasLogo: false,
      hasArt: false,
    };
  }
  const content = context.content
    ? validateDesignContent({
        ...(context.content as Record<string, string | boolean>),
        type: context.contentType,
      })
    : null;
  const value = context.value.trim();
  const hasLogo = Boolean(context.style.showLogo);
  return {
    contentType: context.contentType,
    content: content?.ok ? content.content : null,
    value: value || SAMPLE_VALUE,
    valueIsSample: !value,
    style: fromThemeStyles(context.style, { showLogo: hasLogo }),
    rawStyle: context.style,
    hasLogo,
    ...(context.customLogo ? { customLogo: context.customLogo } : {}),
    hasArt: context.hasArt,
  };
}

/** What the model is told about the editor: the type and look, no values. */
export function describeEditorForModel(base: EditorBase): string {
  const content = base.valueIsSample
    ? "No content yet."
    : `Content type: ${contentTypeLabel(base.contentType)} (${base.contentType}), filled in. Its values are private: you don't see them, and design_qr keeps them unless you pass new content.`;
  return [
    "# The code in the user's editor now",
    content,
    `Logo shown: ${base.hasLogo ? "yes" : "no"}.${base.hasArt ? " Logo QR / Image QR art is on; a new design replaces it." : ""}`,
    `Style: ${JSON.stringify(base.style)}`,
  ].join("\n");
}
