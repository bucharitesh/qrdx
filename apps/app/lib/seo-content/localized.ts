import "server-only";

import type { Locale } from "@repo/i18n/config";
import { getTranslations } from "next-intl/server";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { localizeContent } from "@/lib/i18n/content-server";
import { topicForDeployment } from "./availability";
import { createCollection, type SeoCollection } from "./collection";
import { INDUSTRY_GROUPS } from "./industries";
import { PAGE_TYPES } from "./page-types";
import { PLACEMENT_GROUPS } from "./placements";
import type { SeoGroup } from "./types";

/**
 * Groups as this deployment renders them: no tips, FAQs or recommendations
 * selling what it can't offer (./availability.ts). Filtered in English, so
 * the translations (lib/i18n/content-sources.ts lists both variants) apply.
 */
function forDeployment(groups: SeoGroup[]): SeoGroup[] {
  const customDomains = isFeatureAvailable("customDomains");
  return groups.map((group) => ({
    ...group,
    items: group.items.map((topic) =>
      topicForDeployment(topic, { customDomains }),
    ),
  }));
}

/**
 * The industry and placement collections (/qr-codes-for, /qr-codes-on) in
 * `locale`: topics from the translation memory, headings from the catalog
 * (seoTopics). English pages get the same text as ./index.ts.
 */
export async function localizedCollections(locale: Locale): Promise<{
  industries: SeoCollection;
  placements: SeoCollection;
}> {
  const [t, industryGroups, placementGroups] = await Promise.all([
    getTranslations({ locale, namespace: "seoTopics" }),
    localizeContent(forDeployment(INDUSTRY_GROUPS), locale),
    localizeContent(forDeployment(PLACEMENT_GROUPS), locale),
  ]);
  return {
    industries: createCollection({
      id: "industries",
      basePath: "/qr-codes-for",
      hubName: t("industries.hubName"),
      groups: industryGroups,
      ideasHeading: (topic) =>
        t("industries.ideasHeading", { noun: topic.noun }),
      faqTitle: (topic) => t("industries.faqTitle", { noun: topic.noun }),
    }),
    placements: createCollection({
      id: "placements",
      basePath: "/qr-codes-on",
      hubName: t("placements.hubName"),
      groups: placementGroups,
      ideasHeading: (topic) =>
        t("placements.ideasHeading", { noun: topic.noun }),
      faqTitle: (topic) => t("placements.faqTitle", { noun: topic.noun }),
    }),
  };
}

/** Hosted page type names and descriptions in `locale`. */
export function localizedPageTypes(locale: Locale): Promise<typeof PAGE_TYPES> {
  return localizeContent(PAGE_TYPES, locale);
}
