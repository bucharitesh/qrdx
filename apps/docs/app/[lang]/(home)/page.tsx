import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AsciiDivider } from "@/components/fx/ascii-divider";
import { FAQSection } from "@/components/sections/faq-section";
import { HeroSection } from "@/components/sections/hero-section";
import { HeroVideoSection } from "@/components/sections/hero-video-section";
import { FeatureRowsSection } from "@/components/sections/home/feature-rows-section";
import { GallerySection } from "@/components/sections/home/gallery-section";
import { HomeNumbers } from "@/components/sections/home/numbers/home-numbers";
import { UseCasesSection } from "@/components/sections/home/use-cases-section";
import { UsedBySection } from "@/components/sections/home/used-by-section";
import { isArtAvailable } from "@/lib/ai/art-availability";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { baseUrl, defaultOgImage, siteName } from "@/lib/metadata";
import { PLAN_LIMITS } from "@/lib/plans";
import {
  BILLING_INTERVALS,
  EUR_COUNTRIES,
  PAID_PLANS,
  type PaidPlan,
  PLAN_NAMES,
  PRICING,
  PRICING_CURRENCIES,
} from "@/lib/pricing";
import {
  founderSchema,
  organizationId,
  webSiteAlternateNames,
} from "@/lib/seo-schema";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "meta" });
  return localizedMetadata({
    locale,
    path: "/",
    title: { absolute: t("siteTitle") },
    description: t("siteDescription"),
  });
}

const url = (path: string): string => new URL(path, baseUrl).toString();

const { free, pro, business } = PLAN_LIMITS;

// Custom domains are only sold where they can be added
// (lib/feature-availability-rules.ts); the page updates on the next deploy.
const customDomains = isFeatureAvailable("customDomains");
const domains = (count: number) =>
  customDomains ? `${count} custom domains, ` : "";

/** Offer descriptions; limits come from lib/plans.ts so they can't drift. */
const PLAN_SUMMARY: Record<PaidPlan, string> = {
  pro: `Unlimited dynamic QR codes and hosted pages, ${pro.analyticsRetentionDays / 365} years of scan analytics, ${domains(pro.customDomains)}teams of up to ${pro.teamMembers}, smart routing, A/B tests, UTM tags, passwords, schedules and scan limits.`,
  business: `Everything in Pro, plus white-label hosted pages with custom CSS, unlimited analytics history, ${domains(business.customDomains)}unlimited team members, conversion tracking, webhooks and Slack or Discord alerts.`,
};

const offers = [
  {
    "@type": "Offer",
    name: PLAN_NAMES.free,
    price: "0",
    priceCurrency: "USD",
    url: url("/pricing"),
    description: `Unlimited static QR codes with no account. A free account adds ${free.dynamicCodes} dynamic QR codes, ${free.landingPages} hosted pages and ${free.analyticsRetentionDays} days of scan analytics.`,
  },
  ...PAID_PLANS.flatMap((plan) =>
    BILLING_INTERVALS.flatMap((interval) =>
      PRICING_CURRENCIES.map((currency) => {
        const price = String(PRICING[plan][interval].amounts[currency]);
        return {
          "@type": "Offer",
          name: `${PLAN_NAMES[plan]} (${interval === "month" ? "monthly" : "yearly"})`,
          price,
          priceCurrency: currency,
          url: url("/pricing"),
          description: PLAN_SUMMARY[plan],
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price,
            priceCurrency: currency,
            billingDuration: interval === "month" ? "P1M" : "P1Y",
          },
          // Rupee prices are shown and charged to customers in India only.
          ...(currency === "INR" && {
            eligibleRegion: { "@type": "Country", name: "IN" },
          }),
          // Euro prices (when on): the EU and EEA only.
          ...(currency === "EUR" && {
            eligibleRegion: [...EUR_COUNTRIES].map((name) => ({
              "@type": "Country",
              name,
            })),
          }),
        };
      }),
    ),
  ),
];

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteName,
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  url: url("/"),
  offers,
  description:
    "Free QR code generator and dynamic QR code platform. Make unlimited static QR codes with logos, gradients and patterns, with no signup or watermark. With an account, create dynamic codes you can edit after printing, hosted landing pages, smart routing and scan analytics. Open source (AGPL-3.0).",
  featureList: [
    "Unlimited free static QR codes with no signup and no watermark",
    "Dot patterns, corner-eye shapes, solid colors and linear or radial gradients",
    "Center logos, call-to-action frames and decorative templates",
    "Logo QR and Image QR art that blend a logo or photo into the code",
    "AI-designed QR code themes",
    // AI art is listed where it can run (lib/ai/art-availability.ts).
    ...(isArtAvailable ? ["AI QR code art that still scans"] : []),
    "PNG, JPG, WebP, SVG, PDF and EPS downloads, with print-ready PDFs at exact sizes",
    "Dynamic QR codes with editable destinations and scan analytics",
    "Hosted mobile pages: link lists, business pages, vCards, menus, coupons, events, forms, PDFs, images, audio and video",
    "Smart routing by device, country, language and time, A/B tests and UTM tags",
    "Passwords, start and expiry dates, scan limits and fallback URLs",
    ...(customDomains ? ["Custom domains for short links"] : []),
    "Folders, tags, version history and trash for dynamic codes",
    "Teams with owner, admin and member roles",
    "Email alerts, a weekly digest, Slack and Discord messages and signed webhooks",
    "Bulk QR code generation from CSV",
    "QR code image API, REST API with OAuth, MCP server and CLI",
    "React and TypeScript library on npm",
    "Online QR code and barcode scanner",
    "Never-Hostage Guarantee: dynamic codes keep redirecting on every plan",
    "Open source (AGPL-3.0) and self-hostable",
  ],
  screenshot: url(defaultOgImage.url),
  softwareVersion: "latest",
  license: "https://www.gnu.org/licenses/agpl-3.0.html",
  publisher: { "@id": organizationId },
  author: { "@id": founderSchema["@id"] },
};

// The Organization node itself comes from the (home) layout (lib/seo-schema.ts).
// The schema.org text stays English in every language for now.

// No SearchAction: the site has no search results URL (docs search is a dialog).
const webSiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  alternateName: webSiteAlternateNames,
  url: url("/"),
  publisher: { "@id": organizationId },
  description:
    "Free QR code generator with dynamic QR codes, hosted pages, scan analytics and developer tools. Open source.",
};

export default async function Home() {
  await requireLocale();
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: schema markup requires raw JSON
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationSchema),
        }}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: schema markup requires raw JSON
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webSiteSchema),
        }}
      />
      <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
        <HeroSection />
        {/* Off until a customer is published in lib/customers.ts. */}
        <UsedBySection />
        <GallerySection />
        <UseCasesSection />
        <AsciiDivider />
        <FeatureRowsSection />
        <AsciiDivider />
        <HeroVideoSection />
        {/* Off unless QRDX_HOME_NUMBERS=1 (lib/home-numbers/flag.ts). */}
        <HomeNumbers />
        <FAQSection />
      </main>
    </>
  );
}
