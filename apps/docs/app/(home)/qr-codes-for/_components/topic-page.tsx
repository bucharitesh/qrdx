import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight, Quote } from "lucide-react";
import Link from "next/link";
import { MockupImage } from "@/components/mockups/mockup-image";
import { useCaseImages } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { getQrType } from "@/lib/qr-types-content";
import {
  PAGE_TYPES,
  type Recommendation,
  type SeoCollection,
  type SeoTopic,
} from "@/lib/seo-content";
import { SAMPLE_SHORT_LINK, sizingRows } from "@/lib/seo-content/sizing";

interface TopicPageProps {
  topic: SeoTopic;
  collection: SeoCollection;
  /** The other collection, for cross-links (industries ↔ placements). */
  other: SeoCollection;
}

interface RecommendationView {
  badge: string;
  title: string;
  description?: string;
  why: string;
  href: string;
  linkText: string;
}

function viewRecommendation(item: Recommendation): RecommendationView | null {
  switch (item.kind) {
    case "static": {
      const type = getQrType(item.type);
      if (!type) return null;
      return {
        badge: "Static · free, no account",
        title: `${type.name} QR code`,
        why: item.why,
        href: `/qr-code-generator/${type.type}`,
        linkText: `Open the ${type.name} generator`,
      };
    }
    case "dynamic":
      return {
        badge: "Dynamic · editable, tracked",
        title: item.label,
        why: item.why,
        href: "/dashboard",
        linkText: "Create a dynamic code",
      };
    case "page": {
      const page = PAGE_TYPES[item.page];
      return {
        badge: "Hosted page · editable, tracked",
        title: page.name,
        description: page.description,
        why: item.why,
        href: "/dashboard",
        linkText: "Build it in the dashboard",
      };
    }
  }
}

export function TopicPage({ topic, collection, other }: TopicPageProps) {
  const path = collection.path(topic.slug);
  const recommendations = topic.recommended
    .map(viewRecommendation)
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

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: collection.hubName, path: collection.basePath },
          { name: topic.name, path },
        ]}
        title={topic.title}
        intro={topic.intro}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <Link href="/playground">
              Design a free QR code
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Create a dynamic code</Link>
          </Button>
        </div>
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
        <div className="grid gap-3 px-6 md:px-10 py-10 sm:grid-cols-2">
          {topic.useCases.map((useCase) => (
            <div
              key={useCase.title}
              className="rounded-xl border border-border bg-accent/50 p-5 flex flex-col gap-2"
            >
              <h3 className="font-medium text-secondary-foreground">
                {useCase.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {useCase.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="types" className="flex flex-col w-full">
        <SectionHeader>
          <h2
            id="types"
            className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance"
          >
            Which QR code to use
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium text-sm">
            Static codes are free and need no account, but can't be changed
            after printing. Dynamic codes and hosted pages can be edited at any
            time, count every scan, and keep working on every plan, even if you
            cancel.
          </p>
        </SectionHeader>
        <div className="grid gap-3 px-6 md:px-10 py-10 md:grid-cols-2">
          {recommendations.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border p-5 flex flex-col gap-3"
            >
              <Badge variant="outline">{item.badge}</Badge>
              <h3 className="font-medium text-secondary-foreground">
                {item.title}
              </h3>
              {item.description && (
                <p className="text-sm text-secondary-foreground/80 leading-relaxed">
                  {item.description}
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.why}
              </p>
              <Link
                href={item.href}
                className="mt-auto text-sm font-medium inline-flex items-center gap-1 hover:underline"
              >
                {item.linkText}
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="sizing"
        className="grid w-full md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border"
      >
        <div className="px-6 md:px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 id="sizing" className="text-2xl font-medium tracking-tighter">
            How big to print it
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Minimum printed QR code size by scanning distance
              </caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Where people scan
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Distance
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Minimum code width
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
            For a dynamic short link such as{" "}
            <code className="font-mono">{SAMPLE_SHORT_LINK}</code> at error
            correction Q, without the blank margin. Static Wi-Fi, vCard or long
            URL codes hold more data and need to be larger. Check yours with the{" "}
            <Link href="/tools/print-size" className="underline">
              print size calculator
            </Link>{" "}
            and the{" "}
            <Link href="/tools/scan-checker" className="underline">
              scan checker
            </Link>
            .
          </p>
          {image && (
            <MockupImage
              {...image}
              sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
              className="mt-2 aspect-[4/3] object-cover"
            />
          )}
        </div>
        <div className="px-6 md:px-10 py-10 flex flex-col gap-4">
          <h2 className="text-2xl font-medium tracking-tighter">
            Placement tips
          </h2>
          <ul className="flex list-disc flex-col gap-3 pl-5 text-muted-foreground leading-relaxed">
            {topic.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <h2 className="mt-4 text-2xl font-medium tracking-tighter">
            Call-to-action copy
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A code with a reason to scan beside it gets more scans than a bare
            code. Lines to print next to yours:
          </p>
          <ul className="flex flex-col gap-2">
            {topic.ctas.map((cta) => (
              <li
                key={cta}
                className="flex items-start gap-2 rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm text-secondary-foreground"
              >
                <Quote
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

      <section className="w-full px-6 md:px-10 py-10 grid gap-10 lg:grid-cols-2">
        {related.length > 0 && (
          <RelatedLinks
            heading={other.hubName}
            hubHref={other.basePath}
            items={related.map((item) => ({
              href: other.path(item.slug),
              title: item.title,
              summary: item.summary,
            }))}
          />
        )}
        {group && siblings.length > 0 && (
          <RelatedLinks
            heading={`More in ${group.title.toLowerCase()}`}
            hubHref={collection.basePath}
            items={siblings.map((item) => ({
              href: collection.path(item.slug),
              title: item.title,
              summary: item.summary,
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
  items,
}: {
  heading: string;
  hubHref: string;
  items: { href: string; title: string; summary: string }[];
}) {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-medium tracking-tighter">{heading}</h2>
        <Link
          href={hubHref}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          See all
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl border border-border bg-accent/50 hover:bg-accent transition-colors p-4 flex flex-col gap-1"
          >
            <span className="flex items-center gap-2 font-medium text-secondary-foreground">
              {item.title}
              <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </span>
            <span className="text-sm text-muted-foreground">
              {item.summary}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
