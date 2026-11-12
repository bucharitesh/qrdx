import { cn } from "@repo/design-system/lib/utils";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientContent } from "@/components/i18n/client-content";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink } from "@/components/i18n/locale-link";
import {
  CardGrid,
  cardClass,
  SectionHeading,
  textLinkClass,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { PublicBarcodeGenerator } from "@/components/sections/tools/save-barcode";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { BARCODE_FILES } from "@/lib/barcode/files";
import { BARCODE_FORMATS } from "@/lib/barcode/formats";
import { BARCODE_CONTENT_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { localizeHref } from "@/lib/i18n/paths";
import { requireLocale } from "@/lib/i18n/server";
import { baseUrl } from "@/lib/metadata";
import { PRODUCT_FACTS } from "@/lib/product-facts";

import { BARCODE_FAQS, BARCODE_TIPS, BARCODE_USES } from "./content";

const FORMAT_COUNT = PRODUCT_FACTS.barcodeFormats;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "barcodeGenerator" });
  return localizedMetadata({
    locale,
    path: "/barcode-generator",
    title: t("metaTitle"),
    description: t("metaDescription", { count: FORMAT_COUNT }),
    ownOgImage: true,
  });
}

const linkClass = textLinkClass;

/** What the client generator shows from lib/barcode (components/i18n/content-text.tsx). */
const GENERATOR_CONTENT = { formats: BARCODE_FORMATS, files: BARCODE_FILES };

export default async function BarcodeGeneratorPage() {
  const locale = await requireLocale();
  const [t, common, { uses, faqs, tips }] = await Promise.all([
    getTranslations({ locale, namespace: "barcodeGenerator" }),
    getTranslations({ locale, namespace: "common" }),
    localizeContent(
      { uses: BARCODE_USES, faqs: BARCODE_FAQS, tips: BARCODE_TIPS },
      locale,
    ),
  ]);
  const pageUrl = new URL(
    localizeHref("/barcode-generator", locale),
    baseUrl,
  ).toString();
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "QRdx barcode generator",
          url: pageUrl,
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Any (web browser)",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList: [
            `${FORMAT_COUNT} barcode types: ${BARCODE_FORMATS.map((format) => format.label).join(", ")}`,
            "Check digits calculated and verified",
            "Scan check with an open-source decoder",
            "PNG, JPG, WebP, AVIF, SVG, PDF and EPS downloads",
            "Save barcodes to a free QRdx account to edit later",
            "Barcode image API with no key",
          ],
        }}
      />
      <ToolHero
        pattern="ramp"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: common("tools"), path: "/tools" },
          { name: t("crumb"), path: "/barcode-generator" },
        ]}
        title={t("title")}
        intro={[t("intro1", { count: FORMAT_COUNT }), t("intro2")]}
      />

      <section aria-label={t("toolLabel")} className="w-full px-10 py-10">
        <ClientMessages namespaces={["barcodeTool", "editor.connections"]}>
          <ClientContent data={GENERATOR_CONTENT} rules={BARCODE_CONTENT_RULES}>
            <PublicBarcodeGenerator />
          </ClientContent>
        </ClientMessages>
      </section>

      <section
        aria-labelledby="which"
        className="w-full px-10 py-12 flex flex-col gap-8"
      >
        <SectionHeading
          id="which"
          eyebrow={t("formatsEyebrow")}
          title={t("whichTitle")}
          description={t("whichDescription")}
        />
        <CardGrid count={BARCODE_FORMATS.length}>
          {BARCODE_FORMATS.map((format) => (
            <div
              key={format.id}
              className={cn(cardClass, "flex min-w-0 flex-col gap-1.5 p-4")}
            >
              <h3 className="flex items-baseline justify-between gap-2 text-sm font-medium text-foreground">
                {format.label}
                <span className="text-xs font-normal text-muted-foreground">
                  {format.kind === "linear" ? t("linear") : "2D"}
                </span>
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                {uses[format.id]}
              </p>
            </div>
          ))}
        </CardGrid>
      </section>

      <section
        aria-labelledby="print"
        className="w-full px-10 py-12 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      >
        <SectionHeading
          id="print"
          eyebrow={t("printingEyebrow")}
          title={t("tipsTitle")}
          description={t.rich("tipsDescription", {
            generators: (chunks) => (
              <LocaleLink href="/qr-code-generator" className={linkClass}>
                {chunks}
              </LocaleLink>
            ),
            scanner: (chunks) => (
              <LocaleLink href="/scan" className={linkClass}>
                {chunks}
              </LocaleLink>
            ),
          })}
          className="items-start self-start"
        />
        <ul className="flex flex-col gap-2">
          {tips.map((tip) => (
            <li key={tip} className={cn(cardClass, "p-4 text-sm")}>
              <span className="leading-relaxed text-muted-foreground text-pretty">
                {tip}
              </span>
            </li>
          ))}
          <li className={cn(cardClass, "p-4 text-sm")}>
            <span className="leading-relaxed text-muted-foreground text-pretty">
              {t.rich("credits", {
                bwip: (chunks) => (
                  <a
                    className={linkClass}
                    href="https://github.com/metafloor/bwip-js"
                    rel="noopener"
                    target="_blank"
                  >
                    {chunks}
                  </a>
                ),
                zxing: (chunks) => (
                  <a
                    className={linkClass}
                    href="https://github.com/zxing-cpp/zxing-cpp"
                    rel="noopener"
                    target="_blank"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </span>
          </li>
        </ul>
      </section>

      <FaqList title={t("faqTitle")} faqs={faqs} />
    </main>
  );
}
