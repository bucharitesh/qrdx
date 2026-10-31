import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/sections/section-header";
import { FaqList } from "@/components/sections/tools/faq-list";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { baseUrl } from "@/lib/metadata";
import type { SeoCollection } from "@/lib/seo-content";

interface HubPageProps {
  collection: SeoCollection;
  title: string;
  intro: string[];
  faqs: { question: string; answer: string }[];
  /** Cross-links shown under the groups. */
  links: { href: string; title: string; description: string; cta: string }[];
}

export function HubPage({
  collection,
  title,
  intro,
  faqs,
  links,
}: HubPageProps) {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    itemListElement: collection.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.title,
      url: new URL(collection.path(item.slug), baseUrl).toString(),
    })),
  };

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <JsonLd data={itemList} />
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: collection.hubName, path: collection.basePath },
        ]}
        title={title}
        intro={intro}
      />

      {collection.groups.map((group) => (
        <section
          key={group.id}
          aria-labelledby={`group-${group.id}`}
          className="flex flex-col items-center w-full"
        >
          <SectionHeader>
            <h2
              id={`group-${group.id}`}
              className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance"
            >
              {group.title}
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium text-sm">
              {group.description}
            </p>
          </SectionHeader>
          <div className="w-full px-6 md:px-10 py-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => (
              <Link
                key={item.slug}
                href={collection.path(item.slug)}
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
        </section>
      ))}

      <section className="w-full px-6 md:px-10 py-10 grid gap-6 md:grid-cols-3">
        {links.map((link) => (
          <div key={link.href} className="flex flex-col gap-2">
            <h2 className="text-xl font-medium tracking-tighter">
              {link.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {link.description}
            </p>
            <Link
              href={link.href}
              className="text-sm font-medium inline-flex items-center gap-1 hover:underline"
            >
              {link.cta}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ))}
      </section>

      <FaqList title={`${collection.hubName}: FAQ`} faqs={faqs} />
    </main>
  );
}
