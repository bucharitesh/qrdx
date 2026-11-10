import "server-only";

// Every Simple Icons brand, on the server: the image API, MCP and the
// gallery's routes (app/api/brand-logos) draw marks from here. Never import
// this from client code: it holds all ~3,500 paths (several MB).

import * as simpleIcons from "simple-icons";
import iconData from "simple-icons/icons.json";
import type { BrandIcon } from "./svg";

export { SIMPLE_ICONS_VERSION } from "./catalog.generated";

/** A brand as the gallery lists it: slug, name, color and other names. */
export type BrandIndexEntry =
  | [slug: string, title: string, hex: string]
  | [slug: string, title: string, hex: string, aliases: string[]];

let bySlug: Map<string, BrandIcon> | null = null;

function icons(): Map<string, BrandIcon> {
  if (!bySlug) {
    bySlug = new Map();
    for (const icon of Object.values(simpleIcons)) {
      bySlug.set(icon.slug, {
        slug: icon.slug,
        title: icon.title,
        hex: icon.hex,
        path: icon.path,
      });
    }
  }
  return bySlug;
}

/** The brand with this Simple Icons slug, or null. */
export function getBrandIcon(slug: string): BrandIcon | null {
  return icons().get(slug) ?? null;
}

export function isBrandSlug(slug: string): boolean {
  return icons().has(slug);
}

/** Other names a brand is searched by (former names, translations). */
function aliasesOf(entry: (typeof iconData)[number]): string[] {
  const aliases = entry.aliases;
  if (!aliases) return [];
  const names = new Set<string>([
    ...(aliases.aka ?? []),
    ...(aliases.old ?? []),
    ...(aliases.dup ?? []).map((dup) => dup.title),
    ...Object.values(aliases.loc ?? {}),
  ]);
  names.delete(entry.title);
  return [...names];
}

/** Every brand, A to Z by name, without paths (the gallery's search index). */
export function brandIndex(): BrandIndexEntry[] {
  return iconData
    .filter((entry) => icons().has(entry.slug))
    .map((entry): BrandIndexEntry => {
      const aliases = aliasesOf(entry);
      return aliases.length > 0
        ? [entry.slug, entry.title, entry.hex, aliases]
        : [entry.slug, entry.title, entry.hex];
    });
}
