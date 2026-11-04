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

/** One line under every row of samples, so no one mistakes them for real. */
const SAMPLE_NOTE =
  "Samples in built-in themes. Each one scans, and none leads to a real account.";

const first = (codes: PageCode[] | undefined): PageCode | undefined =>
  codes?.[0];

/** /qr-code-generator/<type>: four designs of the type, under the generator. */
export function TypeCodesSection({
  type,
  name,
}: {
  type: ContentType;
  name: string;
}) {
  const codes = TYPE_CODES[type];
  return (
    <section
      aria-labelledby="designs"
      className="flex w-full flex-col gap-5 px-10 py-10"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="designs" className="text-2xl font-semibold tracking-tight">
          {name} QR code designs
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {SAMPLE_NOTE} Pick one to start from it in the playground.
        </p>
      </div>
      <CodeTiles
        items={codes.map((code) => ({ code }))}
        label={`${name} QR code designs`}
        heading
        className="grid-cols-2 md:grid-cols-4"
      />
    </section>
  );
}

/** /qr-codes-for and /qr-codes-on pages: four codes for the topic, in the hero. */
export function TopicCodeStrip({
  topic,
  collection,
}: {
  topic: Pick<SeoTopic, "slug" | "noun">;
  collection: Pick<SeoCollection, "id">;
}) {
  const codes =
    collection.id === "placements"
      ? PLACEMENT_CODES[topic.slug]
      : INDUSTRY_CODES[topic.slug];
  if (!codes) return null;
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3 pt-4">
      <CodeTiles
        items={codes.map((code) => ({ code }))}
        label={`Sample QR codes for ${topic.noun}`}
        className="grid-cols-2 sm:grid-cols-4"
      />
      <p className="text-xs text-muted-foreground text-center text-balance">
        {SAMPLE_NOTE}
      </p>
    </div>
  );
}

function HubStrip({
  items,
  label,
}: {
  items: { code: PageCode; label: string; href: string }[];
  label: string;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-3 pt-4">
      <CodeTiles
        items={items}
        label={label}
        compact
        className="grid-cols-3 lg:grid-cols-6"
      />
      <p className="text-xs text-muted-foreground text-center text-balance">
        {SAMPLE_NOTE}
      </p>
    </div>
  );
}

/** /qr-code-generator: one code per group, each opening its type's page. */
export function GeneratorHubStrip() {
  const items = GENERATOR_HUB_TYPES.flatMap((type) => {
    const code = first(TYPE_CODES[type]);
    const content = getQrType(type);
    return code && content
      ? [{ code, label: content.name, href: `/qr-code-generator/${type}` }]
      : [];
  });
  return <HubStrip items={items} label="Sample codes from the generators" />;
}

/** /qr-codes-for and /qr-codes-on: one code per group, each opening its page. */
export function TopicHubStrip({ collection }: { collection: SeoCollection }) {
  const placements = collection.id === "placements";
  const slugs = placements ? PLACEMENT_HUB_SLUGS : INDUSTRY_HUB_SLUGS;
  const codes = placements ? PLACEMENT_CODES : INDUSTRY_CODES;
  const items = slugs.flatMap((slug) => {
    const code = first(codes[slug]);
    const topic = collection.get(slug);
    return code && topic
      ? [{ code, label: topic.name, href: collection.path(slug) }]
      : [];
  });
  return (
    <HubStrip
      items={items}
      label={`Sample codes from ${collection.hubName.toLowerCase()}`}
    />
  );
}

/** /tools/print-size: codes for common placements, each opening its sizing table. */
export function PrintSizePlacements() {
  const items = PRINT_SIZE_SLUGS.flatMap((slug) => {
    const code = first(PLACEMENT_CODES[slug]);
    const topic = placements.get(slug);
    return code && topic
      ? [{ code, label: topic.name, href: `${placements.path(slug)}#sizing` }]
      : [];
  });
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
          Sizes by placement
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Each placement guide has a sizing table for the distances people scan
          from. {SAMPLE_NOTE}
        </p>
      </div>
      <CodeTiles
        items={items}
        label="Placement guides with sizing tables"
        heading
        className="grid-cols-2 md:grid-cols-4"
      />
    </section>
  );
}
