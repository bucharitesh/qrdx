import {
  DEFAULT_LANDING_THEME,
  LANDING_CONTENT_VERSION,
  type LandingBlock,
  type LandingPageContent,
  type LandingTheme,
} from "@/types/landing";
import {
  type BlockIcon,
  createBlock,
  getBlock,
  parseLandingPageContent,
} from "../blocks";

/**
 * Page types for hosted landing pages (landing_page.type). A page type is the
 * "New code" picker entry plus a gallery of preset block arrangements
 * (variants). Each type lives in its own file and registers itself:
 *
 *   lib/landing/templates/menu.ts
 *     registerTemplate({ type: "menu", label: "Menu", description: "...",
 *       icon: UtensilsCrossed, order: 40,
 *       variants: [{ id: "cafe", name: "Café", theme: {...},
 *         blocks: [{ type: "header", props: { title: "Café Luna" } }, ...] }] });
 *   lib/landing/templates/index.ts       (+ one line: import "./menu";)
 *
 * Variant blocks list block types and partial props; props are merged over
 * the block's registered defaults and validated when the page is created, so
 * a variant can only reference registered block types.
 *
 * Always import from "@/lib/landing/templates" (registers every type first).
 */

export interface TemplateBlock {
  /** A registered block type (lib/landing/blocks) */
  type: string;
  /** Merged over the block's defaults (shallow), then validated */
  props?: Record<string, unknown>;
  hidden?: boolean;
}

export interface TemplateTheme extends Partial<Omit<LandingTheme, "colors">> {
  colors?: Partial<LandingTheme["colors"]>;
}

export interface PageTemplateVariant {
  /** Kebab-case, unique within the page type */
  id: string;
  name: string;
  description?: string;
  /** Merged over DEFAULT_LANDING_THEME */
  theme?: TemplateTheme;
  blocks: TemplateBlock[];
}

export interface PageTemplate {
  /** Stored in landing_page.type; kebab-case, never rename once shipped */
  type: string;
  label: string;
  description: string;
  icon: BlockIcon;
  /** Picker order, lowest first (registration order breaks ties) */
  order?: number;
  /** Template gallery; the first variant is the default */
  variants: [PageTemplateVariant, ...PageTemplateVariant[]];
}

const TYPE_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;

const templates = new Map<string, PageTemplate>();

/**
 * Registers a page type and returns it. Registering a type again replaces it
 * (module re-evaluation during HMR).
 */
export function registerTemplate(template: PageTemplate): PageTemplate {
  if (!TYPE_PATTERN.test(template.type)) {
    throw new Error(`Invalid landing page type "${template.type}"`);
  }
  const ids = new Set<string>();
  for (const variant of template.variants) {
    if (!TYPE_PATTERN.test(variant.id) || ids.has(variant.id)) {
      throw new Error(
        `Invalid or duplicate variant "${variant.id}" in page type "${template.type}"`,
      );
    }
    ids.add(variant.id);
  }
  templates.set(template.type, template);
  return template;
}

export function getTemplate(type: string): PageTemplate | undefined {
  return templates.get(type);
}

/** Every page type in picker order. */
export function listTemplates(): PageTemplate[] {
  const registered = [...templates.values()];
  return registered
    .map((template, index) => ({ template, index }))
    .sort(
      (a, b) =>
        (a.template.order ?? 100) - (b.template.order ?? 100) ||
        a.index - b.index,
    )
    .map(({ template }) => template);
}

export function getTemplateVariant(
  type: string,
  variantId?: string | null,
): PageTemplateVariant | undefined {
  const template = templates.get(type);
  if (!template) return undefined;
  return variantId
    ? template.variants.find((variant) => variant.id === variantId)
    : template.variants[0];
}

export function mergeTheme(
  overrides: TemplateTheme | undefined,
  base: LandingTheme = DEFAULT_LANDING_THEME,
): LandingTheme {
  const theme = structuredClone(base);
  if (!overrides) return theme;
  const { colors, ...rest } = overrides;
  return {
    ...theme,
    ...structuredClone(rest),
    colors: { ...theme.colors, ...colors },
  };
}

/** A block of `type` with `props` merged over its defaults (throws when invalid). */
export function createTemplateBlock(
  { type, props, hidden }: TemplateBlock,
  id?: string,
): LandingBlock {
  const block = createBlock(type, id);
  const definition = getBlock(type);
  const merged = props
    ? (definition?.schema.parse({
        ...block.props,
        ...structuredClone(props),
      }) as Record<string, unknown>)
    : block.props;
  return { ...block, props: merged, ...(hidden && { hidden }) };
}

/**
 * Fresh, validated page content for a page type's variant (the default
 * variant when `variantId` is omitted). Throws for unknown types/variants and
 * for variants that reference unregistered blocks or invalid props.
 */
export function buildTemplateContent(
  type: string,
  variantId?: string | null,
): LandingPageContent {
  const variant = getTemplateVariant(type, variantId);
  if (!variant) {
    throw new Error(
      `Unknown landing page template "${type}${variantId ? `/${variantId}` : ""}"`,
    );
  }
  const content = {
    version: LANDING_CONTENT_VERSION,
    theme: mergeTheme(variant.theme),
    blocks: variant.blocks.map((block) => createTemplateBlock(block)),
  };
  const parsed = parseLandingPageContent(content);
  if (!parsed.success) {
    throw new Error(
      `Template "${type}/${variant.id}" is invalid: ${parsed.error.issues[0]?.message}`,
    );
  }
  return parsed.data;
}
