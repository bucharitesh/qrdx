import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/i18n/client-messages";
import { MockupImage } from "@/components/mockups/mockup-image";
import { qrTypeGroupImages } from "@/components/mockups/visuals";
import { TypeCodesSection } from "@/components/sections/page-codes/page-code-sections";
import {
  CardGrid,
  LinkCard,
  SectionLink,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import {
  PAGE_TYPE_ICONS,
  QR_TYPE_ICONS,
} from "@/components/sections/tools/topic-icons";
import { TypeGenerator } from "@/components/sections/tools/type-generator";
import { HOSTED_TYPE_RULES, QR_TYPE_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { CONTENT_FORM_NAMESPACES } from "@/lib/i18n/playground";
import { requireLocale } from "@/lib/i18n/server";
import { getQrType, QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import {
  HOSTED_TYPE_SLUGS,
  hostedTypePath,
} from "@/lib/qr-types-content-hosted";
import { buildTimeParams } from "@/lib/static-params";
import { availableHostedType, HostedTypePage } from "./hosted-type-page";

interface PageProps {
  params: Promise<{ type: string }>;
}

/** The type's copy in the page's language, or a 404. */
async function load(params: PageProps["params"]) {
  const [{ type }, locale] = await Promise.all([params, requireLocale()]);
  const source = getQrType(type);
  if (!source) {
    // The PDF and business card pages open a hosted page instead.
    const hosted = availableHostedType(type);
    if (!hosted) notFound();
    return {
      locale,
      hosted: await localizeContent(hosted, locale, HOSTED_TYPE_RULES),
    } as const;
  }
  const [content, t] = await Promise.all([
    localizeContent(source, locale, QR_TYPE_RULES),
    getTranslations({ locale, namespace: "qrGenerator" }),
  ]);
  return { locale, content, t, hosted: null } as const;
}

// Unknown types render notFound() below (lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() =>
    [...QR_TYPE_SLUGS, ...HOSTED_TYPE_SLUGS].map((type) => ({ type })),
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const loaded = await load(params);
  if (loaded.hosted) {
    return localizedMetadata({
      locale: loaded.locale,
      path: hostedTypePath(loaded.hosted.slug),
      title: loaded.hosted.title,
      description: loaded.hosted.metaDescription,
      ownOgImage: true,
    });
  }
  const { locale, content, t } = loaded;
  return localizedMetadata({
    locale,
    path: `/qr-code-generator/${content.type}`,
    title: t("type.title", { name: content.name }),
    description: content.metaDescription,
    ownOgImage: true,
  });
}

export default async function QrTypePage({ params }: PageProps) {
  const loaded = await load(params);
  if (loaded.hosted) {
    return <HostedTypePage content={loaded.hosted} locale={loaded.locale} />;
  }
  const { locale, content, t } = loaded;
  const common = await getTranslations({ locale, namespace: "common" });

  const { name, payload } = content;
  const hostedSource = content.hosted
    ? availableHostedType(content.hosted)
    : undefined;
  const hosted = hostedSource
    ? await localizeContent(hostedSource, locale, HOSTED_TYPE_RULES)
    : undefined;
  const related = await localizeContent(
    content.related
      .map((slug) => getQrType(slug))
      .filter((item) => item !== undefined),
    locale,
    QR_TYPE_RULES,
  );

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="qr"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: t("crumb"), path: "/qr-code-generator" },
          { name, path: `/qr-code-generator/${content.type}` },
        ]}
        title={t("type.title", { name })}
        intro={[content.intro[0]]}
      />

      <section
        id="generator"
        aria-label={t("type.generatorLabel", { name })}
        className="w-full px-10 py-10"
      >
        <ClientMessages
          namespaces={["typeGenerator", ...CONTENT_FORM_NAMESPACES]}
        >
          <TypeGenerator key={content.type} type={content.type} />
        </ClientMessages>
      </section>

      <TypeCodesSection type={content.type} name={name} />

      <section className="grid w-full md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="px-10 py-10 flex flex-col gap-4">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("type.howTo", { name })}
          </h2>
          {/* The hero keeps one paragraph so the generator sits above the fold. */}
          <p className="text-muted-foreground leading-relaxed text-pretty">
            {content.intro[1]}
          </p>
          <ol className="flex flex-col gap-3">
            {content.steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs text-foreground/80">
                  {index + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>
          <MockupImage
            {...qrTypeGroupImages[content.group]}
            sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
            className="mt-2 aspect-[3/2] object-cover"
          />
        </div>

        <div className="px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 className="text-2xl font-medium tracking-tighter">
            {t("type.format", { name })}
          </h2>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("type.formatLabel")}
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
              <code>{payload.format}</code>
            </pre>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("type.exampleLabel")}
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
              <code>{payload.example}</code>
            </pre>
          </div>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            {payload.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </section>

      <FaqList title={t("type.faqTitle", { name })} faqs={content.faqs} />

      <section className="w-full px-10 py-10 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("type.related")}
          </h2>
          <SectionLink href="/qr-code-generator">
            {t("type.allTypes", { count: QR_TYPE_SLUGS.length })}
          </SectionLink>
        </div>
        <CardGrid count={related.length + (hosted ? 1 : 0)}>
          {hosted && (
            <LinkCard
              href={hostedTypePath(hosted.slug)}
              icon={PAGE_TYPE_ICONS[hosted.page]}
              title={t("type.hostedCard", { name: hosted.name })}
              description={hosted.summary}
            />
          )}
          {related.map((item) => (
            <LinkCard
              key={item.type}
              href={`/qr-code-generator/${item.type}`}
              icon={QR_TYPE_ICONS[item.type]}
              title={t("type.relatedCard", { name: item.name })}
              description={item.summary}
            />
          ))}
        </CardGrid>
      </section>
    </main>
  );
}
