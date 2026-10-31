import { SectionHeader } from "@/components/sections/section-header";
import {
  CardGrid,
  type CardIcon,
  LinkCard,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { topicIcon } from "@/components/sections/tools/topic-icons";
import { baseUrl } from "@/lib/metadata";
import type { SeoCollection } from "@/lib/seo-content";

interface HubPageProps {
  collection: SeoCollection;
  title: string;
  intro: string[];
  faqs: { question: string; answer: string }[];
  /** Cross-links shown under the groups. */
  links: {
    href: string;
    title: string;
    description: string;
    icon: CardIcon;
  }[];
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
          <CardGrid
            count={group.items.length}
            className="w-full px-6 md:px-10 py-10"
          >
            {group.items.map((item) => (
              <LinkCard
                key={item.slug}
                href={collection.path(item.slug)}
                icon={topicIcon(item.slug, group.id)}
                title={item.title}
                description={item.summary}
              />
            ))}
          </CardGrid>
        </section>
      ))}

      <section
        aria-label="Related guides and tools"
        className="w-full px-6 md:px-10 py-10"
      >
        <CardGrid count={links.length}>
          {links.map((link) => (
            <LinkCard
              key={link.href}
              href={link.href}
              icon={link.icon}
              title={link.title}
              description={link.description}
            />
          ))}
        </CardGrid>
      </section>

      <FaqList title={`${collection.hubName}: FAQ`} faqs={faqs} />
    </main>
  );
}
