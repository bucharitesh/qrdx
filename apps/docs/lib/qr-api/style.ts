// The editor's style as the REST API and the MCP server accept it: the same
// fields and names as a saved theme (ThemeStyles), validated strictly, with
// two API-only ways to add a logo. Shared by GET /v1/qr (`style`), the MCP
// tools (`style`) and save_template. Safe to import anywhere.
//
// - Colours are hex, rgb()/hsl() or a colour name, solid or a gradient
//   (linear with an angle, or radial) of 2 to GRADIENT_STOPS_MAX stops, so a
//   value can't point a renderer at a remote resource.
// - Frames are a built-in style, or `{ style: "custom", spec }` validated
//   by the engine's frame-spec schema (types/frame-spec.ts: no markup, no
//   URL, no image, hard limits).
// - Logos: `logoIcon` (one of the editor's quick icons, drawn by QRdx) or
//   `logoFileId` (an image the caller uploaded, resolved by lib/qr-api/
//   logo.ts against the caller's workspace). A logo address (`customLogo`)
//   is refused: QRdx never fetches a remote image for a caller.
// - Art (Logo QR, Image QR) is refused: it's built in the browser from the
//   picture (see content/docs/developers/image-api.mdx#limits).
//
// Extension point: new engine options (per-eye colours, `moduleScale`, logo
// size and padding, the circle shape) are added as fields of
// `apiStyleFields` below, and mapped to engine props in
// lib/qr-design/props.ts (designQRProps), which every server render uses.
// The OpenAPI document and the MCP tool schemas are generated from this
// schema, so they pick a new field up with no other change.

import { getTemplateIds } from "qrdx";
import {
  bodyPatternSchema,
  cornerEyeDotPatternSchema,
  cornerEyePatternSchema,
  customFrameSchema,
  errorLevelSchema,
  frameSchema,
} from "qrdx/types";
import { z } from "zod";
import { decodeStyleParam } from "@/lib/playground-style";
import { LOGO_ICON_IDS, type LogoIconId } from "@/lib/qr-design/style";
import type { ThemeStyles } from "@/types/theme";

/** Largest `style` JSON, in UTF-8 bytes (a custom frame spec is up to 32 KB). */
export const API_STYLE_MAX_BYTES = 40_000;

/** Most stops a gradient may have. */
export const GRADIENT_STOPS_MAX = 8;

/** Largest quiet zone, in modules (the editor's slider). */
export const API_MARGIN_MAX = 16;

/** Uploaded file ids (lib/files/types.ts FILE_ID_PATTERN). */
export const FILE_ID = /^[a-z0-9]{20,40}$/;

const HEX =
  /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNCTIONAL = /^(?:rgba?|hsla?)\([\d\s.,%/+-]{1,64}\)$/i;
const NAMED = /^[a-zA-Z]{3,24}$/;

/** A colour that can't load anything: hex, rgb()/hsl() or a colour name. */
export function isSafeColor(value: string): boolean {
  return HEX.test(value) || FUNCTIONAL.test(value) || NAMED.test(value);
}

/** "155dfc" → "#155dfc" (URLs often leave the # out); other values as they are. */
const withHash = (value: string) =>
  HEX.test(value) && !value.startsWith("#") ? `#${value}` : value;

const colorString = z
  .string()
  .trim()
  .max(64)
  .refine(isSafeColor, {
    message: "Must be a hex colour (#155dfc), rgb()/hsl() or a colour name",
  })
  .transform(withHash)
  .describe("A colour: hex (#155dfc), rgb()/hsl() or a colour name");

const stopSchema = z
  .object({
    color: colorString,
    offset: z.number().min(0).max(100).describe("Position, 0 to 100"),
  })
  .strict();

const stopsSchema = z
  .array(stopSchema)
  .min(2)
  .max(GRADIENT_STOPS_MAX)
  .describe(`2 to ${GRADIENT_STOPS_MAX} colour stops`);

/** A solid colour or a gradient, in the engine's ColorConfig shape. */
export const apiColorSchema = z
  .union(
    [
      colorString,
      z.object({ type: z.literal("solid"), color: colorString }).strict(),
      z
        .object({
          type: z.literal("linear"),
          stops: stopsSchema,
          angle: z
            .number()
            .min(-360)
            .max(360)
            .optional()
            .describe("Degrees: 0 left to right, 90 top to bottom"),
        })
        .strict(),
      z.object({ type: z.literal("radial"), stops: stopsSchema }).strict(),
    ],
    {
      error: `Must be a colour (hex, rgb()/hsl() or a colour name) or a linear or radial gradient with 2 to ${GRADIENT_STOPS_MAX} stops`,
    },
  )
  .describe(
    'A colour, or a gradient: { "type": "linear", "angle": 45, "stops": [{ "color": "#155dfc", "offset": 0 }, { "color": "#7c3aed", "offset": 100 }] } or { "type": "radial", "stops": [...] }',
  );

const frameColor = colorString.optional();

/** A built-in call-to-action frame (frame text up to 24 characters). */
const builtInFrameSchema = frameSchema
  .extend({
    color: frameColor,
    textColor: frameColor,
    secondaryColor: frameColor,
  })
  .strict();

/** A frame drawn from a frame spec (the engine validates every limit). */
const customApiFrameSchema = customFrameSchema
  .extend({
    color: frameColor,
    textColor: frameColor,
    secondaryColor: frameColor,
  })
  .strict();

export const apiFrameSchema = z
  .discriminatedUnion("style", [builtInFrameSchema, customApiFrameSchema])
  .describe(
    'A call-to-action frame: a built-in style with its text ({ "style": "banner-bottom", "text": "Scan me" }), or { "style": "custom", "spec": <frame spec> } from the community or a custom frame made in the playground',
  );

const TEMPLATE_IDS = getTemplateIds() as [string, ...string[]];

/** Every field the API accepts (ThemeStyles names, plus the logo fields). */
export const apiStyleFields = {
  bgColor: apiColorSchema.optional().describe("Background"),
  fgColor: apiColorSchema.optional().describe("Dots (data modules)"),
  eyeColor: apiColorSchema
    .optional()
    .describe("The three corner eye frames (defaults to fgColor)"),
  dotColor: apiColorSchema
    .optional()
    .describe("The centre of each corner eye (defaults to fgColor)"),
  bodyPattern: bodyPatternSchema.optional().describe("Shape of the dots"),
  cornerEyePattern: cornerEyePatternSchema
    .optional()
    .describe("Shape of the corner eye frames"),
  cornerEyeDotPattern: cornerEyeDotPatternSchema
    .optional()
    .describe("Shape of the corner eye centres"),
  level: errorLevelSchema
    .optional()
    .describe("Error correction: L 7%, M 15%, Q 25%, H 30%"),
  margin: z
    .number()
    .min(0)
    .max(API_MARGIN_MAX)
    .optional()
    .describe(`Quiet zone, in modules (0 to ${API_MARGIN_MAX}; 4 is ideal)`),
  templateId: z
    .enum(TEMPLATE_IDS)
    .optional()
    .describe('Decorative border template; "default" for none'),
  frame: apiFrameSchema.optional(),
  showLogo: z
    .boolean()
    .optional()
    .describe(
      "Show a logo in the centre. With logoIcon or logoFileId it's that logo; alone it's the QRdx mark, which only the editor draws",
    ),
  logoIcon: z
    .enum(LOGO_ICON_IDS)
    .optional()
    .describe("A quick logo icon, drawn by QRdx on a white tile"),
  logoFileId: z
    .string()
    .regex(FILE_ID, "Must be an uploaded file id")
    .optional()
    .describe(
      "An image you uploaded to QRdx (PNG or JPEG, up to 1 MB), by its file id. Needs an API key of the workspace that owns the file",
    ),
  size: z
    .number()
    .optional()
    .describe("Ignored: saved themes carry it; use the size parameter"),
} as const;

/** The style, strict: unknown keys are refused. */
export const apiStyleSchema = z
  .object(apiStyleFields)
  .strict()
  .describe(
    "The editor's style, as a saved theme stores it (GET /v1/themes returns the same shape)",
  );

export type ApiStyle = z.output<typeof apiStyleSchema>;

/**
 * The same style for MCP tool inputs, as an open object: the full JSON
 * Schema (four colour unions and the frame spec) would fill every client's
 * tool list. Handlers validate it with parseApiStyle, which is just as
 * strict.
 */
export const apiStyleToolSchema = z
  .record(z.string(), z.unknown())
  .describe(
    'The editor\'s style JSON, as design_qr returns it in qrdxStyle and a saved theme stores it. Fields: bgColor, fgColor, eyeColor, dotColor (a colour such as #155dfc, or a gradient { type: linear | radial, angle, stops: [{ color, offset 0-100 }] } with 2 to 8 stops), bodyPattern, cornerEyePattern, cornerEyeDotPattern, level (L, M, Q, H), margin (0-16), templateId, frame (a built-in style with text, or { style: "custom", spec }), showLogo, logoIcon, logoFileId. Unknown fields are refused.',
  );

export interface StyleIssue {
  path: string;
  message: string;
}

export type ParsedStyle =
  | { ok: true; style: ApiStyle }
  | { ok: false; issues: StyleIssue[] };

/** Clear words for the two style fields the API refuses on purpose. */
const REFUSED: Record<string, string> = {
  customLogo:
    "Logo images by address aren't accepted: upload the image to QRdx and pass its file id as logoFileId, or pick a logoIcon.",
  art: "Logo QR and Image QR art aren't available over the API: they're built from your picture in the editor.",
};

/** Validates a style object (already parsed JSON). */
export function parseApiStyle(input: unknown): ParsedStyle {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{ path: "style", message: "Must be a JSON object" }],
    };
  }
  const refused = Object.keys(REFUSED).filter((key) =>
    Object.hasOwn(input, key),
  );
  if (refused.length > 0) {
    return {
      ok: false,
      issues: refused.map((key) => ({
        path: `style.${key}`,
        message: REFUSED[key] as string,
      })),
    };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(input)).length;
  if (bytes > API_STYLE_MAX_BYTES) {
    return {
      ok: false,
      issues: [
        {
          path: "style",
          message: `Must be at most ${API_STYLE_MAX_BYTES} bytes of JSON`,
        },
      ],
    };
  }
  const result = apiStyleSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => ({
        path: ["style", ...issue.path].join("."),
        message: issue.message,
      })),
    };
  }
  return { ok: true, style: result.data };
}

/**
 * A `style` query value: URL-decoded JSON (`{"fgColor":"#155dfc",…}`), or
 * the `style` value of a playground link ("1." + base64url, see
 * lib/playground-style.ts). Either way the strict schema checks it.
 */
export function parseStyleQuery(raw: string): ParsedStyle {
  const value = raw.trim();
  if (value.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(value);
    } catch {
      return {
        ok: false,
        issues: [
          {
            path: "style",
            message:
              "Must be JSON (URL-encode it) or a playground style value (1.…)",
          },
        ],
      };
    }
    return parseApiStyle(json);
  }
  const decoded = decodeStyleParam(value);
  if (!decoded) {
    return {
      ok: false,
      issues: [
        {
          path: "style",
          message:
            "Must be JSON (URL-encode it) or a playground style value (1.…)",
        },
      ],
    };
  }
  return parseApiStyle(decoded.styles);
}

/** The style without the API-only logo fields, as ThemeStyles. */
export function themeFieldsOf(style: ApiStyle): ThemeStyles {
  const { logoIcon: _icon, logoFileId: _file, size: _size, ...rest } = style;
  return rest as ThemeStyles;
}

/** The logo a style asks for, if any. */
export function logoRequestOf(
  style: Pick<ApiStyle, "logoIcon" | "logoFileId">,
):
  | { kind: "icon"; icon: LogoIconId }
  | { kind: "file"; fileId: string }
  | null {
  if (style.logoFileId) return { kind: "file", fileId: style.logoFileId };
  if (style.logoIcon) return { kind: "icon", icon: style.logoIcon };
  return null;
}
