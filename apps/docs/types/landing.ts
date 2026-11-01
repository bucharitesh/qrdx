import { z } from "zod";

/**
 * Hosted landing page content (stored in landing_page.content).
 *
 *   { version: 1, theme: LandingTheme, blocks: LandingBlock[] }
 *
 * Blocks are an open union keyed by `type`: this file only fixes the envelope
 * every block shares — `{ id, type, hidden?, props }` — and leaves `props`
 * permissive. Each block type brings its own zod schema for `props` when it
 * registers itself (lib/landing/registry.ts), so adding a block never touches
 * this file or a central union:
 *
 *   1. `landingPageContentSchema` checks the envelope (shape, sizes, ids).
 *   2. `parseLandingPageContent` (lib/landing/blocks) validates every block's
 *      `props` with its registered schema. On write, unknown types and
 *      invalid props are errors; on read, such blocks are skipped.
 */

export const LANDING_CONTENT_VERSION = 1;
export const MAX_LANDING_BLOCKS = 100;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR, "Use a hex color like #155DFC");

/**
 * Absolute http(s) URL (max 2048 chars). Use for every user-supplied link or
 * asset in block props: it rejects javascript:, data: and other schemes.
 */
export const landingUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a full link starting with https://");

export const landingThemeSchema = z.object({
  colors: z.object({
    /** Page background (also the base under gradient/image backgrounds) */
    background: hexColorSchema,
    /** Body text */
    foreground: hexColorSchema,
    /** Buttons, links and accents */
    primary: hexColorSchema,
    /** Text on `primary` */
    primaryForeground: hexColorSchema,
    /** Cards and secondary surfaces */
    muted: hexColorSchema,
    /** Secondary text */
    mutedForeground: hexColorSchema,
  }),
  /** Font id the renderer maps to a font stack ("system", "inter", ...); unknown ids fall back to system */
  font: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .default("system"),
  /** Corner radius of cards and buttons, in px */
  radius: z.number().min(0).max(32).default(12),
  background: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("solid") }),
      z.object({
        type: z.literal("gradient"),
        from: hexColorSchema,
        to: hexColorSchema,
        angle: z.number().min(0).max(360).default(180),
        /** "radial": a soft glow from the top centre (angle is ignored); default linear */
        shape: z.enum(["linear", "radial"]).optional(),
      }),
      z.object({
        type: z.literal("image"),
        url: landingUrlSchema,
        /** Darkening overlay so text stays readable, 0–1 */
        overlay: z.number().min(0).max(1).default(0.3),
      }),
    ])
    .default({ type: "solid" }),
  logo: z
    .object({
      url: landingUrlSchema,
      alt: z.string().trim().max(200).optional(),
    })
    .optional(),
  // Opt-in style options below have no defaults: a page saved without them
  // renders exactly as it did before they existed (tests/lib/landing-render-compat).
  /** Font id for headings (h1–h3); body text keeps `font` */
  headingFont: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  /** Subtle pattern over the background */
  texture: z.enum(["grain", "dots", "grid"]).optional(),
  /** Space between blocks (default: normal) */
  spacing: z.enum(["compact", "relaxed"]).optional(),
  /** Button corners: fully round or square, instead of the corner radius */
  buttonShape: z.enum(["pill", "sharp"]).optional(),
});

export type LandingTheme = z.output<typeof landingThemeSchema>;

export const DEFAULT_LANDING_THEME: LandingTheme = {
  colors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    primary: "#155DFC",
    primaryForeground: "#ffffff",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
  },
  font: "system",
  radius: 12,
  background: { type: "solid" },
};

/** Lowercase kebab-case block type, e.g. "links", "image-gallery". */
export const blockTypeSchema = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);

/** The envelope shared by every block; `props` is checked by the block's own schema. */
export const landingBlockSchema = z.object({
  /** Stable per page (editor keys, analytics `landing_event.target`) */
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  type: blockTypeSchema,
  /** Kept on the page but not rendered */
  hidden: z.boolean().optional(),
  props: z.record(z.string(), z.unknown()).default({}),
});

export type LandingBlock<
  TType extends string = string,
  TProps = Record<string, unknown>,
> = {
  id: string;
  type: TType;
  hidden?: boolean;
  props: TProps;
};

export const landingPageContentSchema = z
  .object({
    version: z.literal(LANDING_CONTENT_VERSION),
    theme: landingThemeSchema,
    blocks: z.array(landingBlockSchema).max(MAX_LANDING_BLOCKS),
  })
  .superRefine((content, ctx) => {
    const seen = new Set<string>();
    content.blocks.forEach((block, index) => {
      if (seen.has(block.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate block id "${block.id}"`,
          path: ["blocks", index, "id"],
        });
      }
      seen.add(block.id);
    });
  });

export type LandingPageContent = z.output<typeof landingPageContentSchema>;

export function emptyLandingPageContent(
  theme: LandingTheme = DEFAULT_LANDING_THEME,
): LandingPageContent {
  return {
    version: LANDING_CONTENT_VERSION,
    theme: structuredClone(theme),
    blocks: [],
  };
}
