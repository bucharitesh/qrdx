import type { ComponentType } from "react";
import type { z } from "zod";
import {
  type LandingBlock,
  type LandingPageContent,
  type LandingTheme,
  landingPageContentSchema,
} from "@/types/landing";

/**
 * Landing-page block registry. A block type lives in its own files and
 * registers itself; nothing central changes when a block is added.
 *
 *   lib/landing/blocks/links/index.tsx   (no directive: runs on server + client)
 *     registerBlock({ type: "links", category: "links", label: "Links",
 *       icon: LinkIcon, schema: linksSchema, defaults: { items: [] },
 *       Render: LinksBlock, Editor: LinksEditor });
 *   lib/landing/blocks/links/editor.tsx  ("use client")
 *   lib/landing/blocks/index.ts          (+ one line: import "./links";)
 *
 * Render must be server-renderable: a synchronous, pure component of its
 * props (no hooks, browser APIs or data fetching) because it runs both in the
 * /p/<slug> server page and in the editor's live preview. Put interactive
 * parts (forms, carousels) in a child "use client" component.
 * Editor is a "use client" component that edits `props` (controlled).
 *
 * Always import from "@/lib/landing/blocks" (re-exports this module after
 * registering every block), never from this file directly.
 */

export const BLOCK_CATEGORIES = [
  { id: "content", label: "Content" },
  { id: "links", label: "Links & social" },
  { id: "media", label: "Media" },
  { id: "contact", label: "Contact & location" },
  { id: "forms", label: "Forms" },
  { id: "commerce", label: "Menus & commerce" },
  { id: "layout", label: "Layout" },
] as const;

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number]["id"];

export type BlockIcon = ComponentType<{ className?: string }>;

/** Block props: always a JSON object. */
export type BlockProps = Record<string, unknown>;

export interface BlockRenderContext {
  theme: LandingTheme;
  /** "live" on /p/<slug>; "preview" in the editor (no tracking or side effects) */
  mode: "live" | "preview";
  /** null for unsaved pages */
  pageId: string | null;
  /** Code the visitor scanned, when known (for landing_event / form_response) */
  qrCodeId: string | null;
  /** Visitor's user agent on live pages (device-aware blocks such as app links) */
  userAgent?: string | null;
}

export interface BlockRenderProps<P extends BlockProps = BlockProps> {
  id: string;
  props: P;
  context: BlockRenderContext;
}

export interface BlockEditorContext {
  theme: LandingTheme;
  pageId: string | null;
  /** File uploads are available (lib/storage isStorageConfigured) */
  storageEnabled: boolean;
}

export interface BlockEditorProps<P extends BlockProps = BlockProps> {
  id: string;
  value: P;
  onChange: (next: P) => void;
  context: BlockEditorContext;
}

export interface BlockDefinition<
  S extends z.ZodType<BlockProps> = z.ZodType<BlockProps>,
> {
  /** Lowercase kebab-case, unique, stored in content; never rename once shipped */
  type: string;
  category: BlockCategory;
  label: string;
  description?: string;
  icon: BlockIcon;
  /** Validates `props` on every save and read */
  schema: S;
  /** Props of a newly added block (must pass `schema`) */
  defaults: z.input<S>;
  Render: ComponentType<BlockRenderProps<z.output<S>>>;
  Editor: ComponentType<BlockEditorProps<z.output<S>>>;
}

/** A definition with its props type erased (registry storage). */
export type AnyBlockDefinition = BlockDefinition<any>;

const blocks = new Map<string, AnyBlockDefinition>();

/**
 * Registers a block type and returns its definition. Registering a type again
 * replaces it (module re-evaluation during HMR).
 */
export function registerBlock<S extends z.ZodType<BlockProps>>(
  definition: BlockDefinition<S>,
): BlockDefinition<S> {
  if (!/^[a-z][a-z0-9-]{0,47}$/.test(definition.type)) {
    throw new Error(`Invalid landing block type "${definition.type}"`);
  }
  blocks.set(definition.type, definition);
  return definition;
}

export function getBlock(type: string): AnyBlockDefinition | undefined {
  return blocks.get(type);
}

/** Every registered block, in category order, then registration order. */
export function listBlocks(): AnyBlockDefinition[] {
  const order = BLOCK_CATEGORIES.map((category) => category.id);
  return [...blocks.values()].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
  );
}

/** A new block of `type` with its defaults (throws for unknown types). */
export function createBlock(
  type: string,
  id: string = crypto.randomUUID(),
): LandingBlock {
  const definition = blocks.get(type);
  if (!definition) throw new Error(`Unknown landing block type "${type}"`);
  return {
    id,
    type,
    props: definition.schema.parse(structuredClone(definition.defaults)),
  };
}

export type ParseLandingResult =
  | { success: true; data: LandingPageContent }
  | { success: false; error: z.ZodError };

/**
 * Validates page content: the envelope (types/landing.ts) plus each block's
 * props against its registered schema; props come back parsed (defaults
 * applied, unknown keys stripped by object schemas).
 *
 * - "write" (default, for saves): unknown block types and invalid props fail.
 * - "read" (for rendering stored content): such blocks are dropped so one
 *   outdated block never takes the whole page down.
 */
export function parseLandingPageContent(
  input: unknown,
  { mode = "write" }: { mode?: "write" | "read" } = {},
): ParseLandingResult {
  const schema = landingPageContentSchema.transform((content, ctx) => {
    const parsed: LandingBlock[] = [];
    content.blocks.forEach((block, index) => {
      const definition = blocks.get(block.type);
      if (!definition) {
        if (mode === "write") {
          ctx.addIssue({
            code: "custom",
            message: `Unknown block type "${block.type}"`,
            path: ["blocks", index, "type"],
          });
        }
        return;
      }
      const result = definition.schema.safeParse(block.props);
      if (result.success) {
        parsed.push({ ...block, props: result.data });
      } else if (mode === "write") {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: ["blocks", index, "props", ...issue.path],
          });
        }
      }
    });
    return { ...content, blocks: parsed };
  });

  const result = schema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}
