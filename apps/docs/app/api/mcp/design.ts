import "server-only";

import {
  BUILT_IN_FRAMES,
  getAllTemplates,
  OFFICIAL_FRAME_COLLECTIONS,
  OFFICIAL_FRAMES,
} from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  customFrameSchema,
  EYE_POSITIONS,
  FRAME_TEXT_MAX_LENGTH,
  type QRCustomFrame,
} from "qrdx/types";
import { z } from "zod";
import { MCP_REF } from "@/lib/analytics/handoff-tags";
import { brandLogoOptions } from "@/lib/brand-logos/options";
import { communityItemStyle } from "@/lib/community/api";
import { OFFICIAL_FRAME_RESOLVER } from "@/lib/community/catalog";
import { presetLogoIcon } from "@/lib/community/public-style";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { playgroundHref, withHandoffRef } from "@/lib/playground-links";
import { encodeStyleParam, type OmittedPart } from "@/lib/playground-style";
import { readLogoDataUrl } from "@/lib/qr-api/logo";
import {
  type ApiStyle,
  apiFrameSchema,
  apiStyleFields,
  FILE_ID,
  parseApiStyle,
} from "@/lib/qr-api/style";
import {
  contentCatalog,
  contentInputSchema,
  describeContent,
  validateDesignContent,
} from "@/lib/qr-design/content";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import { isQuickLogoIcon, LOGO_ICON_PATTERN } from "@/lib/qr-design/logo-icon";
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
  fromThemeStyles,
  HEX_COLOR,
  LOGO_ICON_IDS,
  type LogoIconId,
  MARGIN_MAX,
  TEMPLATE_IDS,
  toThemeStyles,
} from "@/lib/qr-design/style";
import type { ActiveScope } from "@/lib/scope";
import type { ThemeStyles } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";

// The MCP design_qr tool: the same content validation, style vocabulary and
// score-and-repair loop as the editor's AI chat, without a model on QRdx's
// side. The calling assistant chooses the style from list_options (or starts
// from a built-in preset or a community item); QRdx validates it, scores it
// with the editor's scan score and repairs it to Great.
//
// Logos: a quick icon QRdx draws, or an image the caller uploaded (by file
// id, with the workspace's API key). Either is scored by its footprint, like
// the editor does. A custom frame (a frame spec) is drawn and scored as it
// is; repairs change the code, never the frame.

export const DESIGN_SIZE_MIN = 128;
export const DESIGN_SIZE_MAX = 1024;

const LOGO_INPUTS = ["none", ...LOGO_ICON_IDS] as const;

/** What a base leaves unset; eye colours stay unset so they follow the dots. */
const CLASSIC_BASE: ThemeStyles = {
  bgColor: CLASSIC_STYLE.bgColor,
  fgColor: CLASSIC_STYLE.fgColor,
  bodyPattern: CLASSIC_STYLE.bodyPattern,
  cornerEyePattern: CLASSIC_STYLE.cornerEyePattern,
  cornerEyeDotPattern: CLASSIC_STYLE.cornerEyeDotPattern,
  level: CLASSIC_STYLE.level,
  margin: CLASSIC_STYLE.margin,
};

/** A custom frame in a tool input: its spec is checked in the handler. */
const customFrameInputSchema = designFrameSchema.omit({ style: true }).extend({
  style: z.literal("custom"),
  spec: z
    .record(z.string(), z.unknown())
    .describe(
      "A frame spec (qrdx.frame v1), for example the style.frame.spec of a community frame from get_community_item",
    ),
});

const hexInput = z.string().regex(HEX_COLOR).describe("#RRGGBB");
const eyeInput = z
  .object({ outer: hexInput.optional(), inner: hexInput.optional() })
  .strict();

/**
 * Engine options design_qr draws as they are (repairs never change them):
 * per-eye colours (#RRGGBB, like the rest of design_qr), dot size, auto
 * error correction, the circle shape and the logo's layout.
 */
const engineInputFields = {
  eyeColors: z
    .object(
      Object.fromEntries(
        EYE_POSITIONS.map((position) => [position, eyeInput.optional()]),
      ) as Record<
        (typeof EYE_POSITIONS)[number],
        z.ZodOptional<typeof eyeInput>
      >,
    )
    .strict()
    .optional()
    .describe(
      "Per-eye colors: { topLeft, topRight, bottomLeft }, each { outer, inner } as #RRGGBB",
    ),
  moduleScale: apiStyleFields.moduleScale,
  autoLevel: apiStyleFields.autoLevel,
  shape: apiStyleFields.shape,
  logoOptions: apiStyleFields.logoOptions,
};
type EngineInput = {
  [K in keyof typeof engineInputFields]?: z.output<
    (typeof engineInputFields)[K]
  >;
};
const ENGINE_KEYS = Object.keys(engineInputFields) as (keyof EngineInput)[];

/** The engine options a style or a base sets. */
function engineOptionsOf(source: object | null | undefined): EngineInput {
  if (!source) return {};
  return Object.fromEntries(
    ENGINE_KEYS.filter(
      (key) => (source as Record<string, unknown>)[key] !== undefined,
    ).map((key) => [key, (source as Record<string, unknown>)[key]]),
  ) as EngineInput;
}

/** Every style option, all optional: missing ones get scannable defaults. */
const styleInputSchema = designStyleSchema
  .omit({ logo: true, frame: true })
  .partial()
  .extend({
    frame: z
      .union([designFrameSchema, customFrameInputSchema])
      .optional()
      .describe(
        'A built-in frame ({ "style": "banner-bottom", "text": "Scan me" }) or a custom one ({ "style": "custom", "spec": … })',
      ),
    logo: z
      .union([
        z.enum(LOGO_INPUTS),
        z
          .string()
          .regex(LOGO_ICON_PATTERN, "Must be a quick icon or a brand slug"),
      ])
      .optional()
      .describe(
        "The logo in the center: a quick icon on a white tile (wifi, location, phone, email, link, file, calendar, whatsapp, instagram), any brand from Simple Icons by slug (spotify, paypal, googlemaps; add :black or :white for those colors, else it's the brand color), or none. For your own image use logo_file_id.",
      ),
    ...engineInputFields,
  })
  .describe(
    "How the code looks. Leave options out for defaults (or the preset's or community item's): eyes and eye centers follow the dot color, square shapes, margin 4, level Q, no frame.",
  );

export const designQrInputSchema = z.object({
  content: contentInputSchema.describe(
    "What the code opens: a type and its fields (list_options lists the fields of every type)",
  ),
  style: styleInputSchema.optional(),
  preset: z
    .string()
    .max(64)
    .optional()
    .describe(
      "Start from a built-in QRdx theme by id (list_options lists them); style options you set win over it",
    ),
  community_item: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Start from a community theme or frame by id, such as frame:wifi-card (search_community finds them); style options you set win over it",
    ),
  logo_file_id: z
    .string()
    .regex(FILE_ID, "Must be an uploaded file id")
    .optional()
    .describe(
      "Your own logo: an image you uploaded to QRdx (PNG or JPEG, up to 1 MB), by file id. Needs the workspace's API key on this connection (Authorization: Bearer qrdx_…).",
    ),
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
type StyleInput = NonNullable<DesignQrInput["style"]>;

/** The requested style with defaults filled in (no base). */
export function styleFromInput(style: DesignQrInput["style"]): DesignStyle {
  const fg = style?.fgColor ?? CLASSIC_STYLE.fgColor;
  const {
    frame,
    logo: _logo,
    eyeColors: _eyes,
    moduleScale: _scale,
    autoLevel: _auto,
    shape: _shape,
    logoOptions: _layout,
    ...rest
  } = style ?? {};
  return {
    ...CLASSIC_STYLE,
    ...rest,
    fgColor: fg,
    eyeColor: style?.eyeColor ?? fg,
    dotColor: style?.dotColor ?? style?.eyeColor ?? fg,
    frame: frame && frame.style !== "custom" ? frame : CLASSIC_STYLE.frame,
    logo: "none",
  };
}

/** The style options set over a base design (a preset or a community item). */
function styleOnBase(base: DesignStyle, style: StyleInput | undefined) {
  const {
    frame,
    logo: _logo,
    eyeColors: _eyes,
    moduleScale: _scale,
    autoLevel: _auto,
    shape: _shape,
    logoOptions: _layout,
    ...rest
  } = style ?? {};
  const fg = rest.fgColor;
  return {
    ...base,
    ...rest,
    // A new dot colour carries to the eyes unless they're set too.
    ...(fg && !rest.eyeColor ? { eyeColor: fg } : {}),
    ...(fg && !rest.dotColor ? { dotColor: rest.eyeColor ?? fg } : {}),
    frame:
      frame === undefined
        ? base.frame
        : frame.style === "custom"
          ? CLASSIC_STYLE.frame
          : frame,
    logo: "none",
  } satisfies DesignStyle;
}

export type DesignFailure = {
  ok: false;
  message: string;
  /** The API error shape, for errors with one (keys, files, limits) */
  error?: { code: string; message: string; status: number };
};

export type DesignQrResult =
  | {
      ok: true;
      summary: string;
      design: {
        content: ReturnType<typeof describeContent>;
        payload: string;
        /** The design in design_qr's vocabulary */
        style: Omit<DesignStyle, "frame"> & {
          frame: DesignStyle["frame"] | QRCustomFrame;
        };
        /**
         * The editor's style JSON: pass it to save_template, to
         * generate_qr_code's `style`, or to the image API's `style`.
         */
        qrdxStyle: ApiStyle;
        score: number;
        grade: string;
        great: boolean;
        stillFailing: { id: string; message: string; fix?: string }[];
        repairs: number;
        fellBack: boolean;
        changes: string[];
        attempts: { score: number; grade: string; by: string }[];
        preset?: string;
        communityItem?: string;
        /** Opens the design in the QRdx playground (no logo, no content) */
        playgroundUrl: string | null;
        /** What the playground link leaves out */
        playgroundLeftOut: OmittedPart[];
        notes: string[];
      };
      svg?: string;
      png: Uint8Array;
    }
  | DesignFailure;

const failure = (error: unknown): DesignFailure | null => {
  if (error instanceof HttpError) {
    return {
      ok: false,
      message: error.message,
      error: { code: error.code, message: error.message, status: error.status },
    };
  }
  if (error instanceof DesignTooLongError) {
    return { ok: false, message: error.message };
  }
  if (error instanceof Error && error.name === "CommunityItemError") {
    return { ok: false, message: error.message };
  }
  return null;
};

/** The playground link for a design: its style only, at most 4096 characters. */
export function playgroundLink(
  styles: ThemeStyles,
  preset?: string,
): { url: string | null; leftOut: OmittedPart[] } {
  const encoded = encodeStyleParam(styles, {
    ...(preset ? { preset } : {}),
    officialFrames: OFFICIAL_FRAME_RESOLVER,
  });
  if (!encoded) return { url: null, leftOut: [] };
  // Tagged ref=mcp, so a visit (and a sign-up) from it counts for the MCP
  // server (lib/analytics/handoff-tags.ts).
  const href = withHandoffRef(
    playgroundHref({
      style: encoded.value,
      ...(preset ? { preset } : {}),
    }),
    MCP_REF,
  );
  return {
    url: new URL(href, baseUrl).toString(),
    leftOut: encoded.omitted,
  };
}

export interface DesignContext {
  /** The API key's workspace, for logo_file_id; null without a key */
  scope: () => Promise<ActiveScope | null>;
}

export async function designQr(
  input: DesignQrInput,
  context: DesignContext = { scope: async () => null },
): Promise<DesignQrResult> {
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
    const notes: string[] = [];

    // ── The base: a built-in preset and/or a community item ──
    let base: ThemeStyles | null = null;
    const preset = input.preset?.trim();
    if (preset) {
      const found = Object.hasOwn(defaultPresets, preset)
        ? defaultPresets[preset]
        : undefined;
      if (!found || preset.startsWith("shuffle")) {
        return {
          ok: false,
          message: `There's no built-in theme "${preset.slice(0, 64)}". list_options lists the ids.`,
        };
      }
      base = { ...found.styles };
    }
    let communityItem: string | undefined;
    if (input.community_item) {
      const item = await communityItemStyle(input.community_item);
      base = { ...(base ?? {}), ...item.style };
      communityItem = item.id;
    }

    // ── A custom frame: drawn and scored as it is, never repaired ──
    let customFrame: QRCustomFrame | null = null;
    const requestedFrame = input.style?.frame;
    if (requestedFrame?.style === "custom") {
      const parsed = apiFrameSchema.safeParse(requestedFrame);
      if (!parsed.success || parsed.data.style !== "custom") {
        return {
          ok: false,
          message: `The custom frame isn't valid: ${
            parsed.success
              ? "not a custom frame"
              : parsed.error.issues
                  .slice(0, 5)
                  .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                  .join("; ")
          }`,
        };
      }
      customFrame = parsed.data as QRCustomFrame;
    } else if (
      requestedFrame === undefined &&
      base?.frame?.style === "custom"
    ) {
      const parsed = customFrameSchema.safeParse(base.frame);
      if (parsed.success) customFrame = parsed.data;
    }

    // ── The style to start from ──
    // A frame-only item sits on the classic code, as on its community page.
    const initial: DesignStyle = base
      ? styleOnBase(
          fromThemeStyles({ ...CLASSIC_BASE, ...base }, { showLogo: false }),
          input.style,
        )
      : styleFromInput(input.style);
    if (base?.showLogo && !base.customLogo) {
      notes.push(
        "The starting design shows the QRdx mark, which design_qr doesn't draw; add a logo icon or logo_file_id for a logo.",
      );
    }

    // ── The logo: your file, a brand, an icon, or the base's icon ──
    // A brand logo goes through the loop like a file does ("keep"): the
    // design style's logo choices are the quick icons only.
    let logoFile: string | null = null;
    let logoIcon: LogoIconId | null = null;
    let brandLogo: string | null = null;
    const requestedLogo = input.style?.logo;
    if (
      requestedLogo &&
      !(LOGO_INPUTS as readonly string[]).includes(requestedLogo)
    ) {
      if (input.logo_file_id) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Pass either a brand logo in style.logo or logo_file_id, not both.",
        );
      }
      brandLogo = requestedLogo;
      logoFile = logoIconDataUrl(requestedLogo);
    } else if (input.logo_file_id) {
      const scope = await context.scope();
      if (!scope) {
        throw new HttpError(
          401,
          "UNAUTHORIZED",
          "logo_file_id needs the API key of the workspace that owns the file on this MCP connection: add the header Authorization: Bearer qrdx_… in your client's settings for this server.",
        );
      }
      logoFile = await readLogoDataUrl(scope, input.logo_file_id);
    } else if (requestedLogo && requestedLogo !== "none") {
      logoIcon = requestedLogo as LogoIconId;
    } else if (input.style?.logo === undefined && base) {
      const baseIcon = presetLogoIcon(base.customLogo);
      if (isQuickLogoIcon(baseIcon)) {
        logoIcon = baseIcon;
      } else if (baseIcon) {
        try {
          logoFile = logoIconDataUrl(baseIcon);
          brandLogo = baseIcon;
        } catch {
          // A brand the catalogue doesn't have: no logo.
        }
      }
    }
    initial.logo = logoFile ? "keep" : (logoIcon ?? "none");

    // Engine options from the base, then the ones the caller set.
    const engine: EngineInput = {
      ...engineOptionsOf(base),
      ...engineOptionsOf(input.style),
    };
    const withFrame = (style: ThemeStyles): ThemeStyles => ({
      ...style,
      ...(engine as ThemeStyles),
      ...(customFrame ? { frame: customFrame } : {}),
    });

    const result = await runDesignLoop({
      value: content.value,
      initial,
      hasLogo: Boolean(logoFile),
      score: (value, style) => scoreDesign(value, withFrame(style)),
    });

    const themeStyles = withFrame(toThemeStyles(result.style));
    const drawnLogo =
      result.style.logo === "keep" && logoFile
        ? logoFile
        : result.style.logo !== "none" && result.style.logo !== "keep"
          ? result.style.logo === "qrdx"
            ? undefined
            : logoIconDataUrl(result.style.logo)
          : undefined;
    themeStyles.showLogo = Boolean(drawnLogo);

    const { showLogo, ...withoutLogo } = themeStyles;
    const qrdxStyle: ApiStyle = {
      ...withoutLogo,
      ...(showLogo && result.style.logo === "keep" && input.logo_file_id
        ? { showLogo: true, logoFileId: input.logo_file_id }
        : {}),
      ...(showLogo && result.style.logo === "keep" && brandLogo
        ? { showLogo: true, logoIcon: brandLogo }
        : {}),
      ...(showLogo &&
      result.style.logo !== "keep" &&
      result.style.logo !== "none" &&
      result.style.logo !== "qrdx"
        ? { showLogo: true, logoIcon: result.style.logo }
        : {}),
    } as ApiStyle;
    // The JSON handed back must pass the API's own check.
    const checked = parseApiStyle(qrdxStyle);
    if (!checked.ok) {
      throw new Error(
        `design_qr built a style the API refuses: ${checked.issues[0]?.message}`,
      );
    }

    const link = playgroundLink(withoutLogo, preset || undefined);
    // Links never carry a logo (owner decision: styles only).
    if (drawnLogo && !link.leftOut.includes("logo")) link.leftOut.push("logo");
    const great = result.grade === "great";
    const summary = [
      `Scan score ${result.score}/100 (${result.grade})${
        result.repairs > 0
          ? ` after ${result.repairs} repair${result.repairs === 1 ? "" : "s"}${result.fellBack ? " and a fallback to a classic code" : ""}`
          : ""
      }.`,
      great
        ? ""
        : customFrame
          ? "It couldn't reach Great: the content is long or the custom frame lowers the score. Shorten the content, try another frame or print the code bigger."
          : "It couldn't reach Great: the content is long. Shorten it or print the code bigger.",
      result.changes.length > 0
        ? `Changed to get there: ${result.changes.join("; ")}.`
        : "No changes were needed.",
      `Content: ${describeContent(content.content)} (${new TextEncoder().encode(content.value).length} bytes).`,
      link.url ? `Open it in the playground: ${link.url}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      ok: true,
      summary,
      design: {
        content: describeContent(content.content),
        payload: content.value,
        style: customFrame
          ? { ...result.style, frame: customFrame }
          : result.style,
        qrdxStyle: checked.style,
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
        ...(preset ? { preset } : {}),
        ...(communityItem ? { communityItem } : {}),
        playgroundUrl: link.url,
        playgroundLeftOut: link.leftOut,
        notes,
      },
      ...(input.include_svg
        ? {
            svg: renderDesignSvg(
              content.value,
              themeStyles,
              input.size,
              drawnLogo,
            ),
          }
        : {}),
      png: await renderDesignPng(
        content.value,
        themeStyles,
        input.size,
        drawnLogo,
      ),
    };
  } catch (error) {
    const known = failure(error);
    if (known) return known;
    throw error;
  }
}

/**
 * QRdx's official frames by collection, by id: each is a community item
 * ("frame:<id>"), so design_qr, generate_qr_code and the image API take it.
 */
function officialFrameOptions() {
  return {
    how: "QRdx's official frames (CC0), by collection. Pass \"frame:<id>\" as community_item to design_qr, or as item to generate_qr_code and the image API; get_community_item returns one's style. Seasonal ids name their holiday or season.",
    collections: Object.fromEntries(
      OFFICIAL_FRAME_COLLECTIONS.map((collection) => [
        collection.id,
        {
          label: collection.label,
          ids: OFFICIAL_FRAMES.filter(
            (frame) => frame.collection === collection.id,
          ).map((frame) => frame.id),
        },
      ]),
    ),
  };
}

/** Every value design_qr accepts, for the list_options tool. */
export function designOptions() {
  return {
    contentTypes: contentCatalog(),
    style: {
      colors:
        "#RRGGBB. bgColor (background), fgColor (dots), eyeColor (corner eyes), dotColor (eye centers). Every color needs 4.5:1 contrast with the background to score Great; dark on light scans best.",
      gradients:
        "Optional, per part (body, background, eyes, eyeCentres): { type: linear | radial, from, to, angle (linear, 0-360) }.",
      bodyPatterns: BODY_PATTERN,
      eyes: CORNER_EYE_PATTERNS,
      eyeCentres: CORNER_EYE_DOT_PATTERNS,
      frames: {
        styles: ["none", ...BUILT_IN_FRAMES.map((frame) => frame.style)],
        textMaxLength: FRAME_TEXT_MAX_LENGTH,
        fields: `{ style, text, secondaryText (${BUILT_IN_FRAMES.filter(
          (frame) =>
            frame.spec.labels.some((label) => label.slot === "secondary"),
        )
          .map((frame) => frame.style)
          .join(", ")}), color, textColor }`,
        custom:
          '{ style: "custom", spec } with a frame spec, such as a community frame\'s style.frame from get_community_item. It is drawn as it is; repairs never change it.',
        official: officialFrameOptions(),
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
      engineOptions:
        "eyeColors { topLeft, topRight, bottomLeft: { outer, inner } } (#RRGGBB), moduleScale 0.5-1 (dot size), autoLevel, shape (square or circle), logoOptions { size 0.1-0.3, padding 0-2 modules, x and y 0-1, shape square|rounded|circle (crop), plate (color) }. Drawn and scored as given; repairs never change them.",
      logos: {
        icons: LOGO_ICON_IDS,
        brands: brandLogoOptions(),
        how: "style.logo picks a quick icon QRdx draws on a white tile, or a brand logo by its Simple Icons slug (brands.popular; add :black or :white). logo_file_id uses an image you uploaded to QRdx (PNG or JPEG, up to 1 MB) and needs the workspace's API key on the MCP connection. Logos are scored by the modules they cover; a repair may raise error correction to H or remove the logo.",
      },
    },
    presets: Object.entries(defaultPresets).map(([id, preset]) => ({
      id,
      name: preset.label ?? id,
    })),
    community:
      "search_community finds community frames and themes; pass an item's id as community_item.",
    size: { min: DESIGN_SIZE_MIN, max: DESIGN_SIZE_MAX, default: 512 },
    scanScore: {
      great: GREAT_SCORE,
      maxRepairs: MAX_REPAIRS,
      method:
        "The editor's scan score: the code is rendered, then decoded at 96, 160 and 320 px through a phone-camera model, plus contrast, quiet zone, eye shape, logo and shape-pair checks.",
    },
  };
}
