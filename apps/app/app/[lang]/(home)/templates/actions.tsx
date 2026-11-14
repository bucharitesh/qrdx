"use server";

import { isLocale } from "@repo/i18n/config";
import type { ReactNode } from "react";
import { InLocale } from "@/components/i18n/in-locale";
import { SectionCards } from "./_components/section-cards";
import { MAX_CHUNKS_PER_REQUEST, parseChunkKey } from "./_lib/gallery";
import { localizedGallery } from "./_lib/sections";

/**
 * Template cards that load as someone scrolls the gallery
 * (_components/deferred-cards.tsx), by chunk: "<type>:<offset>" is a page
 * type's cards from the offset-th on. Public and read-only: the gallery is
 * built from the template registry, with no database. Keys that name no
 * cards are left out of the result.
 */
export async function loadTemplateCards(
  locale: string,
  keys: string[],
): Promise<Record<string, ReactNode>> {
  if (!(isLocale(locale) && Array.isArray(keys))) return {};
  const wanted = new Set(
    keys
      .filter((key): key is string => typeof key === "string")
      .slice(0, MAX_CHUNKS_PER_REQUEST),
  );
  const { localDemos } = await localizedGallery(locale);
  const chunks: Record<string, ReactNode> = {};
  for (const key of wanted) {
    const chunk = parseChunkKey(key);
    if (!chunk) continue;
    const demos = localDemos
      .filter((demo) => demo.template.type === chunk.type)
      .slice(chunk.offset);
    if (demos.length === 0) continue;
    chunks[key] = (
      <InLocale locale={locale}>
        <SectionCards demos={demos} locale={locale} />
      </InLocale>
    );
  }
  return chunks;
}
