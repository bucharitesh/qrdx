import { Setting4 as Settings2 } from "iconsax-reactjs";
import { z } from "zod";
import { registerBlock } from "@/lib/landing/registry";
import type { LandingPageContent } from "@/types/landing";
import { imageSchema, lineText } from "./block-kit";
import { MAX_CUSTOM_CSS_LENGTH, scopeCustomCss } from "./custom-css";
import { PageSettingsEditor } from "./editor/page-settings-editor";

/**
 * Page-level settings stored as a single hidden-from-palette block (the page
 * envelope in types/landing.ts has no settings field): share preview, search
 * indexing and Business custom CSS. Renders nothing itself; the /p renderer
 * reads it for metadata and styles. The editor manages it in its Settings tab.
 */
export const PAGE_SETTINGS_TYPE = "page-settings";

export const pageSettingsSchema = z.object({
  /** Share preview and search description */
  description: lineText(300).default(""),
  /** Share preview image (og:image) */
  shareImage: imageSchema.optional(),
  /** Let search engines index the page (off by default) */
  indexable: z.boolean().default(false),
  /** Business: validated + scoped by components/landing/custom-css */
  customCss: z
    .string()
    .max(MAX_CUSTOM_CSS_LENGTH)
    .default("")
    .superRefine((css, ctx) => {
      if (!css.trim()) return;
      const result = scopeCustomCss(css);
      if (!result.ok) ctx.addIssue({ code: "custom", message: result.error });
    }),
});

export type PageSettings = z.output<typeof pageSettingsSchema>;

export const DEFAULT_PAGE_SETTINGS: PageSettings = pageSettingsSchema.parse({});

export function getPageSettings(content: LandingPageContent): PageSettings {
  const block = content.blocks.find((b) => b.type === PAGE_SETTINGS_TYPE);
  return block ? (block.props as PageSettings) : DEFAULT_PAGE_SETTINGS;
}

export const pageSettingsBlock = registerBlock({
  type: PAGE_SETTINGS_TYPE,
  category: "layout",
  label: "Page settings",
  description: "Share preview, search indexing and custom CSS",
  icon: Settings2,
  schema: pageSettingsSchema,
  defaults: {},
  Render: () => null,
  Editor: PageSettingsEditor,
});
