import { Ruler, TableDocument } from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MockupImage } from "@/components/mockups/mockup-image";
import { qrTypeGroupImages } from "@/components/mockups/visuals";
import { GeneratorHubStrip } from "@/components/sections/page-codes/page-code-sections";
import { SectionHeader } from "@/components/sections/section-header";
import { CardGrid, LinkCard } from "@/components/sections/tools/cards";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import {
  PAGE_TYPE_ICONS,
  QR_TYPE_ICONS,
} from "@/components/sections/tools/topic-icons";
import { isPathAvailable } from "@/lib/feature-availability";
import { HOSTED_TYPE_RULES, QR_TYPE_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { QR_TYPE_GROUPS, QR_TYPES } from "@/lib/qr-types-content";
import { HOSTED_QR_TYPES, hostedTypePath } from "@/lib/qr-types-content-hosted";

const count = QR_TYPES.length;

// "QR code types": the home page owns "QR code generator".
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "qrGenerator.hub" });
  return localizedMetadata({
    locale,
    path: "/qr-code-generator",
    title: t("metaTitle", { count }),
    description: t("metaDescription", { count }),
    ownOgImage: true,
  });
}

export default async function QrTypesHubPage() {
  const locale = await requireLocale();
  const [t, common, { groups, types }, hosted] = await Promise.all([
    getTranslations({ locale, namespace: "qrGenerator" }),
    getTranslations({ locale, namespace: "common" }),
    localizeContent(
      { groups: QR_TYPE_GROUPS, types: QR_TYPES },
      locale,
      QR_TYPE_RULES,
    ),
    localizeContent(
      HOSTED_QR_TYPES.filter((item) =>
        isPathAvailable(hostedTypePath(item.slug)),
      ),
      locale,
      HOSTED_TYPE_RULES,
    ),
  ]);
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="qr"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: "/qr-code-generator" },
        ]}
        title={t("hub.title")}
        intro={[t("hub.intro1", { count }), t("hub.intro2")]}
      >
        <GeneratorHubStrip />
      </ToolHero>

      {groups.map((group) => {
        const items = types.filter((item) => item.group === group.id);
        if (items.length === 0) return null;

        return (
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
            <div className="w-full px-10 py-10 grid gap-6 lg:grid-cols-3">
              <MockupImage
                {...qrTypeGroupImages[group.id]}
                sizes="(min-width: 1280px) 400px, (min-width: 1024px) 33vw, 100vw"
                className="aspect-[3/2] object-cover lg:sticky lg:top-24 lg:self-start"
              />
              <CardGrid
                count={items.length}
                max={2}
                className="min-w-0 lg:col-span-2"
              >
                {items.map((item) => (
                  <LinkCard
                    key={item.type}
                    href={`/qr-code-generator/${item.type}`}
                    icon={QR_TYPE_ICONS[item.type]}
                    title={t("hub.cardTitle", { name: item.name })}
                    description={item.summary}
                  />
                ))}
              </CardGrid>
            </div>
          </section>
        );
      })}

      <section
        aria-labelledby="hosted"
        className="flex flex-col items-center w-full"
      >
        <SectionHeader>
          <h2
            id="hosted"
            className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance"
          >
            {t("hub.hostedTitle")}
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium text-sm">
            {t("hub.hostedDescription")}
          </p>
        </SectionHeader>
        <div className="w-full px-10 py-10">
          <CardGrid count={hosted.length + 1}>
            {hosted.map((item) => (
              <LinkCard
                key={item.slug}
                href={hostedTypePath(item.slug)}
                icon={PAGE_TYPE_ICONS[item.page]}
                title={t("hub.cardTitle", { name: item.name })}
                description={item.summary}
              />
            ))}
            <LinkCard
              href="/qr-codes-on/menus"
              icon={PAGE_TYPE_ICONS.menu}
              title={t("hub.menuTitle")}
              description={t("hub.menuDescription")}
            />
          </CardGrid>
        </div>
      </section>

      <section aria-label={t("hub.moreTools")} className="w-full px-10 py-10">
        <CardGrid count={2} max={2}>
          <LinkCard
            href="/tools/bulk"
            icon={TableDocument}
            title={t("hub.bulkTitle")}
            description={t("hub.bulkDescription")}
          />
          <LinkCard
            href="/tools/print-size"
            icon={Ruler}
            title={t("hub.printTitle")}
            description={t("hub.printDescription")}
          />
        </CardGrid>
      </section>
    </main>
  );
}
