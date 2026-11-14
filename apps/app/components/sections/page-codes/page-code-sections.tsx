import { getTranslations } from "next-intl/server";
import { PAGE_CODE_RULES, QR_TYPE_RULES } from "@/lib/i18n/content-rules";
import { localized } from "@/lib/i18n/content-server";
import {
  GENERATOR_HUB_TYPES,
  INDUSTRY_CODES,
  INDUSTRY_HUB_SLUGS,
  type PageCode,
  PLACEMENT_CODES,
  PLACEMENT_HUB_SLUGS,
  PRINT_SIZE_SLUGS,
  TYPE_CODES,
} from "@/lib/landing/page-codes";
import { getQrType } from "@/lib/qr-types-content";
import {
  placements,
  type SeoCollection,
  type SeoTopic,
} from "@/lib/seo-content";
import type { ContentType } from "@/types/qr-content";
import { CodeTiles } from "./code-tiles";

// Under every row of samples, pageCodes.sampleNote says they're samples, so
// no one mistakes them for real; pageCodes.startNote, under rows whose codes
// open the playground, says so. Tile labels are translated content
// (lib/i18n/content-sources.ts).

/** Codes with their labels in the page's language. */
const localCodes = (codes: PageCode[]) => localized(codes, PAGE_CODE_RULES);

const first = (codes: PageCode[] | undefined): PageCode | undefined =>
  codes?.[0];

/** /qr-code-generator/<type>: four designs of the type, under the generator. */
export async function TypeCodesSection({
  type,
  name,
}: {
  type: ContentType;
  /** The type's name in the page's language. */
  name: string;
}) {
  const [t, codes] = await Promise.all([
    getTranslations("pageCodes"),
    localCodes(TYPE_CODES[type]),
  ]);
  return (
    <section
      aria-labelledby="designs"
      className="flex w-full flex-col gap-5 px-10 py-10"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="designs" className="text-2xl font-semibold tracking-tight">
          {t("typeDesigns", { name })}
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("sampleNote")} {t("startNote")}
        </p>
      </div>
      <CodeTiles
        items={codes.map((code) => ({ code }))}
        label={t("typeDesigns", { name })}
        heading
        className="grid-cols-2 md:grid-cols-4"
      />
    </section>
  );
}

/** The sample codes of a /qr-codes-for or /qr-codes-on page. */
export function topicCodes(
  topic: Pick<SeoTopic, "slug">,
  collection: Pick<SeoCollection, "id">,
): PageCode[] | undefined {
  return collection.id === "placements"
    ? PLACEMENT_CODES[topic.slug]
    : INDUSTRY_CODES[topic.slug];
}

/** /qr-codes-for and /qr-codes-on pages: four codes for the topic, in the hero. */
export async function TopicCodeStrip({
  topic,
  collection,
}: {
  /** In the page's language. */
  topic: Pick<SeoTopic, "slug" | "noun">;
  collection: Pick<SeoCollection, "id">;
}) {
  const source = topicCodes(topic, collection);
  if (!source) return null;
  const [t, codes] = await Promise.all([
    getTranslations("pageCodes"),
    localCodes(source),
  ]);
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3 pt-4">
      <CodeTiles
        items={codes.map((code) => ({ code }))}
        label={t("topicSamples", { noun: topic.noun })}
        className="grid-cols-2 sm:grid-cols-4"
      />
      <p className="text-xs text-muted-foreground text-center text-balance">
        {t("sampleNote")} {t("startNote")}
      </p>
    </div>
  );
}

async function HubStrip({
  items,
  label,
}: {
  items: { code: PageCode; label: string }[];
  label: string;
}) {
  const t = await getTranslations("pageCodes");
  return (
    <div className="flex w-full flex-col items-center gap-3 pt-4">
      <CodeTiles
        items={items}
        label={label}
        compact
        className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      />
      <p className="text-xs text-muted-foreground text-center text-balance">
        {t("sampleNote")} {t("startNote")}
      </p>
    </div>
  );
}

/**
 * /qr-code-generator: one code per group, each opening the playground with
 * its design and type (the cards below link every type's page).
 */
export async function GeneratorHubStrip() {
  const source = GENERATOR_HUB_TYPES.flatMap((type) => {
    const code = first(TYPE_CODES[type]);
    const content = getQrType(type);
    return code && content ? [{ code, label: content.name }] : [];
  });
  const [t, items] = await Promise.all([
    getTranslations("pageCodes"),
    // The label is the type's name (translated QR type content).
    localized(source, { skip: [...(QR_TYPE_RULES.skip ?? []), "code"] }),
  ]);
  return <HubStrip items={items} label={t("generatorSamples")} />;
}

/**
 * /qr-codes-for and /qr-codes-on: one code per group, each opening the
 * playground with its design and type (the cards below link every page).
 */
export async function TopicHubStrip({
  collection,
}: {
  collection: SeoCollection;
}) {
  const placements = collection.id === "placements";
  const slugs = placements ? PLACEMENT_HUB_SLUGS : INDUSTRY_HUB_SLUGS;
  const codes = placements ? PLACEMENT_CODES : INDUSTRY_CODES;
  const source = slugs.flatMap((slug) => {
    const code = first(codes[slug]);
    const topic = collection.get(slug);
    return code && topic ? [code] : [];
  });
  const [t, local] = await Promise.all([
    getTranslations("pageCodes"),
    localCodes(source),
  ]);
  return (
    <HubStrip
      items={local.map((code) => ({ code, label: code.label }))}
      label={t(placements ? "placementSamples" : "industrySamples")}
    />
  );
}

/** /tools/print-size: codes for common placements, each opening its sizing table. */
export async function PrintSizePlacements() {
  const source = PRINT_SIZE_SLUGS.flatMap((slug) => {
    const code = first(PLACEMENT_CODES[slug]);
    const topic = placements.get(slug);
    return code && topic
      ? [{ code, label: topic.name, href: `${placements.path(slug)}#sizing` }]
      : [];
  });
  const [t, items] = await Promise.all([
    getTranslations("pageCodes"),
    // The label is the placement's name (translated SEO content).
    localized(source, { skip: ["code"] }),
  ]);
  return (
    <section
      aria-labelledby="sizes-by-placement"
      className="flex w-full flex-col gap-5 px-10 py-10"
    >
      <div className="flex flex-col gap-1.5">
        <h2
          id="sizes-by-placement"
          className="text-2xl font-medium tracking-tighter"
        >
          {t("sizesTitle")}
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {t("sizesDescription")} {t("sampleNote")}
        </p>
      </div>
      <CodeTiles
        items={items}
        label={t("sizesLabel")}
        heading
        className="grid-cols-2 md:grid-cols-4"
      />
    </section>
  );
}
