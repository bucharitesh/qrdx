import type { SeoGroup, SeoTopic } from "./types";

export interface SeoCollection {
  id: "industries" | "placements";
  /** Route prefix, e.g. "/qr-codes-for". */
  basePath: string;
  /** Hub breadcrumb and link label. */
  hubName: string;
  groups: SeoGroup[];
  items: SeoTopic[];
  get: (slug: string) => SeoTopic | undefined;
  groupOf: (slug: string) => SeoGroup | undefined;
  path: (slug: string) => string;
  /** H2 above the use-case grid. */
  ideasHeading: (topic: SeoTopic) => string;
  faqTitle: (topic: SeoTopic) => string;
}

export function createCollection(
  config: Pick<
    SeoCollection,
    "id" | "basePath" | "hubName" | "groups" | "ideasHeading" | "faqTitle"
  >,
): SeoCollection {
  const items = config.groups.flatMap((group) => group.items);
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const groupBySlug = new Map(
    config.groups.flatMap((group) =>
      group.items.map((item) => [item.slug, group] as const),
    ),
  );

  return {
    ...config,
    items,
    get: (slug) => bySlug.get(slug),
    groupOf: (slug) => groupBySlug.get(slug),
    path: (slug) => `${config.basePath}/${slug}`,
  };
}
