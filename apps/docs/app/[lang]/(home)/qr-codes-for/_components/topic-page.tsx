import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, QuoteDown, Routing2 } from "iconsax-reactjs";
import { getLocale, getTranslations } from "next-intl/server";
import { SignInLink } from "@/components/auth/sign-in-link";
import { LocaleLink } from "@/components/i18n/locale-link";
import { MockupImage } from "@/components/mockups/mockup-image";
import { useCaseImages } from "@/components/mockups/visuals";
import { codePlaygroundHref } from "@/components/sections/page-codes/code-tiles";
import {
  TopicCodeStrip,
  topicCodes,
} from "@/components/sections/page-codes/page-code-sections";
import { SectionHeader } from "@/components/sections/section-header";
import {
  CardGrid,
  type CardIcon,
  cardClass,
  IconTile,
  interactiveCardClass,
  LinkCard,
  SectionLink,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { SpotlightLink } from "@/components/sections/tools/spotlight-link";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import {
  PAGE_TYPE_ICONS,
  QR_TYPE_ICONS,
  topicIcon,
} from "@/components/sections/tools/topic-icons";
import { QR_TYPE_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { playgroundHref } from "@/lib/playground-links";
import { getQrType, type QrTypeContent } from "@/lib/qr-types-content";
import type {
  PageTypeId,
  Recommendation,
  SeoCollection,
  SeoTopic,
} from "@/lib/seo-content";
import { localizedPageTypes } from "@/lib/seo-content/localized";
import type { SeoPageType } from "@/lib/seo-content/page-types";
import { SAMPLE_SHORT_LINK, sizingRows } from "@/lib/seo-content/sizing";

interface TopicPageProps {
  /** As this deployment renders it, in the page's language (lib/seo-content/localized.ts). */
  topic: SeoTopic;
  collection: SeoCollection;
  /** The other collection, for cross-links (industries ↔ placements). */
  other: SeoCollection;
}

type Translate = Awaited<ReturnType<typeof getTranslations<"seoTopics.topic">>>;

interface Lookups {
  t: Translate;
  qrType: (type: string) => QrTypeContent | undefined;
  pageTypes: Record<PageTypeId, SeoPageType>;
}

interface RecommendationView {
  badge: string;
  title: string;
  description?: string;
  why: string;
  href: string;
  linkText: string;
  icon: CardIcon;
}

function viewRecommendation(
  item: Recommendation,
  { t, qrType, pageTypes }: Lookups,
): RecommendationView | null {
  switch (item.kind) {
    case "static": {
      const type = qrType(item.type);
      if (!type) return null;
      return {
        badge: t("badgeStatic"),
        title: t("staticTitle", { name: type.name }),
        why: item.why,
        // The type's generator page: a working generator that also hands off
        // to the playground, and the internal link its search ranking needs.
        href: `/qr-code-generator/${type.type}`,
        linkText: t("staticLink", { name: type.name }),
        icon: QR_TYPE_ICONS[type.type],
      };
    }
    case "dynamic":
      return {
        badge: t("badgeDynamic"),
        title: item.label,
        why: item.why,
        href: "/dashboard",
        linkText: t("dynamicLink"),
        icon: Routing2,
      };
    case "page": {
      const page = pageTypes[item.page];
      return {
        badge: t("badgePage"),
        title: page.name,
        description: page.description,
        why: item.why,
        href: `/templates#${item.page}`,
        linkText: t("pageLink"),
        icon: PAGE_TYPE_ICONS[item.page],
      };
    }
  }
}

export async function TopicPage({ topic, collection, other }: TopicPageProps) {
  const locale = await getLocale();
  const staticTypes = topic.recommended.flatMap((item) =>
    item.kind === "static" ? [getQrType(item.type)].filter(Boolean) : [],
  ) as QrTypeContent[];
  const [t, common, types, pageTypes] = await Promise.all([
    getTranslations({ locale, namespace: "seoTopics.topic" }),
    getTranslations({ locale, namespace: "common" }),
    localizeContent(staticTypes, locale, QR_TYPE_RULES),
    localizedPageTypes(locale),
  ]);
  const byType = new Map(types.map((type) => [type.type as string, type]));
  const lookups: Lookups = { t, qrType: (type) => byType.get(type), pageTypes };
  const path = collection.path(topic.slug);
  const recommendations = topic.recommended
    .map((item) => viewRecommendation(item, lookups))
    .filter((item) => item !== null);
  const rows = sizingRows(topic.distances);
  const image = topic.image ? useCaseImages[topic.image] : undefined;
  const related = topic.related
    .map((slug) => other.get(slug))
    .filter((item) => item !== undefined);
  const group = collection.groupOf(topic.slug);
  const siblings = (group?.items ?? []).filter(
    (item) => item.slug !== topic.slug,
  );
  // The hero's call to action starts from the page's first sample: its type
  // and design, with QRdx's generic sample content.
  const firstCode = topicCodes(topic, collection)?.[0];

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        crumbs={[
          { name: common("home"), path: "/" },
          { name: collection.hubName, path: collection.basePath },
          { name: topic.name, path },
        ]}
        title={topic.title}
        intro={topic.intro}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <LocaleLink
              href={
                firstCode ? codePlaygroundHref(firstCode) : playgroundHref()
              }
            >
              {common("designFree")}
              <ArrowRight className="size-4" />
            </LocaleLink>
          </Button>
          <Button variant="outline" asChild>
            <SignInLink href="/dashboard">{common("createDynamic")}</SignInLink>
          </Button>
        </div>
        <TopicCodeStrip topic={topic} collection={collection} />
      </ToolHero>

      <section aria-labelledby="ideas" className="flex flex-col w-full">
        <SectionHeader>
          <h2
            id="ideas"
            className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance"
          >
            {collection.ideasHeading(topic)}
          </h2>
        </SectionHeader>
        <CardGrid count={topic.useCases.length} className="px-10 py-10">
          {topic.useCases.map((useCase, index) => (
            <div
              key={useCase.title}
              className={cn(cardClass, "flex min-w-0 flex-col gap-2 p-5")}
            >
              <span className="font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-medium text-foreground">{useCase.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
                {useCase.description}
              </p>
            </div>
          ))}
        </CardGrid>
      </section>

      <section aria-labelledby="types" className="flex flex-col w-full">
        <SectionHeader>
          <h2
            id="types"
            className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance"
          >
            {t("typesTitle")}
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium text-sm">
            {t("typesDescription")}
          </p>
        </SectionHeader>
        <CardGrid
          count={recommendations.length}
          max={2}
          className="px-10 py-10"
        >
          {recommendations.map((item) => (
            <SpotlightLink
              key={item.title}
              href={item.href}
              requireSignIn={item.href.startsWith("/dashboard")}
              className={cn(
                cardClass,
                interactiveCardClass,
                "flex h-full min-w-0 flex-col gap-3 p-5",
              )}
            >
              <div className="flex items-start gap-3.5">
                <IconTile icon={item.icon} />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="w-fit rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {item.badge}
                  </span>
                  <h3 className="font-medium text-foreground">{item.title}</h3>
                </div>
              </div>
              {item.description && (
                <p className="text-sm text-foreground/80 leading-relaxed text-pretty">
                  {item.description}
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
                {item.why}
              </p>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium text-foreground">
                {item.linkText}
                <ArrowRight
                  aria-hidden
                  className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
            </SpotlightLink>
          ))}
        </CardGrid>
      </section>

      <section
        aria-labelledby="sizing"
        className="grid w-full md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border"
      >
        <div className="px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 id="sizing" className="text-2xl font-medium tracking-tighter">
            {t("sizingTitle")}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("sizingCaption")}</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("colWhere")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("colDistance")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("colMinimum")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-normal text-secondary-foreground"
                    >
                      {row.label}
                    </th>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {row.distance}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {row.minimum}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t.rich("sizingNote", {
              link: SAMPLE_SHORT_LINK,
              code: (chunks) => <code className="font-mono">{chunks}</code>,
              size: (chunks) => (
                <LocaleLink href="/tools/print-size" className={textLinkClass}>
                  {chunks}
                </LocaleLink>
              ),
              checker: (chunks) => (
                <LocaleLink
                  href="/tools/scan-checker"
                  className={textLinkClass}
                >
                  {chunks}
                </LocaleLink>
              ),
            })}
          </p>
          {image && (
            <MockupImage
              {...image}
              sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
              className="mt-2 aspect-[4/3] object-cover"
            />
          )}
        </div>
        <div className="px-10 py-10 flex flex-col gap-4">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("tipsTitle")}
          </h2>
          <ul className="flex list-disc flex-col gap-3 pl-5 text-muted-foreground leading-relaxed">
            {topic.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <h2 className="mt-4 text-2xl font-medium tracking-tighter">
            {t("ctaTitle")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("ctaDescription")}
          </p>
          <ul className="flex flex-col gap-2">
            {topic.ctas.map((cta) => (
              <li
                key={cta}
                className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground"
              >
                <QuoteDown
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
                {cta}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FaqList title={collection.faqTitle(topic)} faqs={topic.faqs} />

      <section
        className={cn(
          "w-full px-10 py-12 grid gap-12",
          related.length > 0 &&
            group &&
            siblings.length > 0 &&
            "xl:grid-cols-2 xl:gap-10",
        )}
      >
        {related.length > 0 && (
          <RelatedLinks
            heading={other.hubName}
            hubHref={other.basePath}
            seeAll={common("seeAll")}
            items={related.map((item) => ({
              href: other.path(item.slug),
              title: item.title,
              summary: item.summary,
              icon: topicIcon(item.slug, other.groupOf(item.slug)?.id),
            }))}
          />
        )}
        {group && siblings.length > 0 && (
          <RelatedLinks
            heading={t("moreIn", {
              // "More in food and drink"; other languages keep the casing.
              group: locale === "en" ? group.title.toLowerCase() : group.title,
            })}
            hubHref={collection.basePath}
            seeAll={common("seeAll")}
            items={siblings.map((item) => ({
              href: collection.path(item.slug),
              title: item.title,
              summary: item.summary,
              icon: topicIcon(item.slug, group.id),
            }))}
          />
        )}
      </section>
    </main>
  );
}

function RelatedLinks({
  heading,
  hubHref,
  seeAll,
  items,
}: {
  heading: string;
  hubHref: string;
  seeAll: string;
  items: { href: string; title: string; summary: string; icon: CardIcon }[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
        <SectionLink href={hubHref}>{seeAll}</SectionLink>
      </div>
      <CardGrid count={items.length} max={2}>
        {items.map((item) => (
          <LinkCard
            key={item.href}
            href={item.href}
            icon={item.icon}
            title={item.title}
            description={item.summary}
          />
        ))}
      </CardGrid>
    </div>
  );
}
