import { cn } from "@repo/design-system/lib/utils";
import {
  Barcode,
  Calendar,
  Call,
  Card,
  DocumentText,
  Link,
  Location,
  Personalcard,
  Wifi,
} from "iconsax-reactjs";
import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink } from "@/components/i18n/locale-link";
import { RegisterScannerServiceWorker } from "@/components/scanner/register-sw";
import { Scanner } from "@/components/scanner/scanner";
import {
  type CardIcon,
  cardClass,
  IconTile,
  SectionHeading,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { localizeHref } from "@/lib/i18n/paths";
import { requireLocale } from "@/lib/i18n/server";
import { baseUrl } from "@/lib/metadata";
import { playgroundHref } from "@/lib/playground-links";
import { rootViewport, siteIcons } from "@/lib/root-metadata";
import { isWebRiskConfigured } from "@/lib/safety/web-risk";
import {
  SCANNER_APP_DARK,
  SCANNER_APP_LIGHT,
  scannerManifestPath,
  scannerScope,
} from "@/lib/scanner-app";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "scan" });
  return {
    ...localizedMetadata({
      locale,
      path: "/scan",
      title: t("metaTitle"),
      description: t("metaDescription"),
      ownOgImage: true,
    }),
    // The installable scanner (lib/scanner-app.ts): its own app per
    // language, opening on this page.
    manifest: scannerManifestPath(locale),
    appleWebApp: {
      capable: true,
      title: t("app.shortName"),
      statusBarStyle: "default",
    },
    icons: { ...siteIcons, apple: "/app-icons/scanner/apple-touch-icon.png" },
  };
}

// The installed app's title bar and the phone's status bar follow the page.
export const viewport: Viewport = {
  ...rootViewport,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: SCANNER_APP_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: SCANNER_APP_DARK },
  ],
};

/** Barcode formats; product names stay as they are in every language. */
const FORMATS = [
  "formatQr",
  "Data Matrix",
  "Aztec",
  "PDF417",
  "formatEan",
  "formatUpc",
  "Code 128",
  "Code 39",
] as const;

const CONTENT_TYPES: {
  key:
    | "links"
    | "wifi"
    | "contacts"
    | "events"
    | "locations"
    | "phone"
    | "payments"
    | "products"
    | "text";
  icon: CardIcon;
}[] = [
  { key: "links", icon: Link },
  { key: "wifi", icon: Wifi },
  { key: "contacts", icon: Personalcard },
  { key: "events", icon: Calendar },
  { key: "locations", icon: Location },
  { key: "phone", icon: Call },
  { key: "payments", icon: Card },
  { key: "products", icon: Barcode },
  { key: "text", icon: DocumentText },
];

const FAQS = [
  "how",
  "safe",
  "verified",
  "private",
  "wifi",
  "batch",
  "offline",
  "browsers",
  "install",
  "share",
] as const;

const linkClass =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

/** The client components' catalog parts (components/scanner). */
const SCANNER_MESSAGES = ["scanner"];

export default async function ScanPage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "scan" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const webRisk = isWebRiskConfigured() ? "yes" : "no";
  const domains = isFeatureAvailable("customDomains") ? "yes" : "no";
  const pageUrl = new URL(localizeHref("/scan", locale), baseUrl).toString();
  const formats = FORMATS.map((format) =>
    format.startsWith("format") ? t(format as "formatQr") : format,
  ).join(", ");
  const faqs = FAQS.map((key) => ({
    question: t(`faq.${key}Question`),
    answer:
      key === "safe" || key === "private"
        ? t(`faq.${key}Answer`, { webRisk })
        : key === "verified"
          ? t("faq.verifiedAnswer", { domains })
          : t(`faq.${key}Answer`),
  }));
  return (
    <main
      className="flex flex-col divide-y divide-border min-h-screen w-full"
      data-scanner-app=""
    >
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "QRdx QR code scanner",
          url: pageUrl,
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Any (web browser)",
          browserRequirements: "Requires a camera for live scanning",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList: [
            "Scan QR codes and barcodes with the camera",
            "Scan codes in uploaded, dropped or pasted images",
            "Safe-link preview with redirect chain",
            "Batch scanning with CSV export",
            "On-device scan history",
          ],
        }}
      />
      <ToolHero
        pattern="scan"
        crumbs={[
          { name: common("home"), path: "/" },
          { name: common("tools"), path: "/tools" },
          { name: t("crumb"), path: "/scan" },
        ]}
        title={t("title")}
        intro={[t("intro1"), t("intro2", { webRisk })]}
      />

      <section
        aria-label={t("toolLabel")}
        className="w-full px-10 py-10"
        data-scanner-tool=""
      >
        <ClientMessages namespaces={SCANNER_MESSAGES}>
          <Scanner />
        </ClientMessages>
        <RegisterScannerServiceWorker scope={scannerScope(locale)} />
      </section>

      <section
        aria-labelledby="reads"
        className="w-full px-10 py-12 flex flex-col gap-8"
      >
        <SectionHeading
          id="reads"
          eyebrow={t("formatsEyebrow")}
          title={t("readsTitle")}
          description={t("readsDescription", { formats })}
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:[&>li:last-child]:col-span-2 lg:[&>li:last-child]:col-span-1">
          {CONTENT_TYPES.map((type) => (
            <li
              key={type.key}
              className={cn(cardClass, "flex min-w-0 items-start gap-3.5 p-4")}
            >
              <IconTile icon={type.icon} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="text-sm font-medium text-foreground">
                  {t(`types.${type.key}.name`)}
                </h3>
                <p className="text-sm leading-snug text-muted-foreground text-pretty">
                  {t(`types.${type.key}.detail`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="safety"
        className="w-full px-10 py-12 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      >
        <SectionHeading
          id="safety"
          eyebrow={t("safetyEyebrow")}
          title={t("safetyTitle")}
          description={t.rich("safetyDescription", {
            generators: (chunks) => (
              <LocaleLink href="/qr-code-generator" className={linkClass}>
                {chunks}
              </LocaleLink>
            ),
            editor: (chunks) => (
              <LocaleLink href={playgroundHref()} className={linkClass}>
                {chunks}
              </LocaleLink>
            ),
            checker: (chunks) => (
              <LocaleLink href="/tools/scan-checker" className={linkClass}>
                {chunks}
              </LocaleLink>
            ),
          })}
          className="items-start self-start"
        />
        <ol className="flex flex-col gap-2">
          {[
            t("safety1"),
            t("safety2"),
            t("safety3", { webRisk }),
            t("safety4"),
          ].map((step, index) => (
            <li
              key={step}
              className={cn(cardClass, "flex gap-3.5 p-4 text-sm")}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-muted/40 font-mono text-xs text-foreground/80">
                {index + 1}
              </span>
              <span className="leading-relaxed text-muted-foreground text-pretty">
                {step}
              </span>
            </li>
          ))}
          <li className={cn(cardClass, "flex gap-3.5 p-4 text-sm")}>
            <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-muted/40 font-mono text-xs text-foreground/80">
              5
            </span>
            <span className="leading-relaxed text-muted-foreground text-pretty">
              {t.rich("safety5", {
                report: (chunks) => (
                  <LocaleLink href="/report-abuse" className={linkClass}>
                    {chunks}
                  </LocaleLink>
                ),
              })}
            </span>
          </li>
        </ol>
      </section>

      <FaqList title={t("faqTitle")} faqs={faqs} />
    </main>
  );
}
