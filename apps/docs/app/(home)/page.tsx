import type { Metadata } from "next";
import { AsciiDivider } from "@/components/fx/ascii-divider";
import { FAQSection } from "@/components/sections/faq-section";
import { HeroSection } from "@/components/sections/hero-section";
import { HeroVideoSection } from "@/components/sections/hero-video-section";
import { FeatureRowsSection } from "@/components/sections/home/feature-rows-section";
import { UseCasesSection } from "@/components/sections/home/use-cases-section";
import { env } from "@/lib/env";
import {
  baseUrl,
  createMetadata,
  defaultOgImage,
  siteDescription,
  siteName,
  siteTitle,
} from "@/lib/metadata";
import { PLAN_LIMITS } from "@/lib/plans";
import {
  BILLING_INTERVALS,
  PAID_PLANS,
  type PaidPlan,
  PLAN_NAMES,
  PRICING,
  PRICING_CURRENCIES,
} from "@/lib/pricing";

export const metadata: Metadata = createMetadata({
  title: { absolute: siteTitle },
  description: siteDescription,
  path: "/",
});

const url = (path: string): string => new URL(path, baseUrl).toString();

const organizationId = url("/#organization");

const { free, pro, business } = PLAN_LIMITS;

/** Offer descriptions; limits come from lib/plans.ts so they can't drift. */
const PLAN_SUMMARY: Record<PaidPlan, string> = {
  pro: `Unlimited dynamic QR codes and hosted pages, ${pro.analyticsRetentionDays / 365} years of scan analytics, ${pro.customDomains} custom domains, teams of up to ${pro.teamMembers}, smart routing, A/B tests, UTM tags, passwords, schedules and scan limits.`,
  business: `Everything in Pro, plus white-label hosted pages with custom CSS, unlimited analytics history, ${business.customDomains} custom domains, unlimited team members, conversion tracking, webhooks and Slack or Discord alerts.`,
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
    // Same check as lib/ai/art.ts: AI art only runs where fal.ai is configured.
    ...(env.FAL_KEY ? ["AI QR code art that still scans"] : []),
    "PNG, JPG, SVG, PDF and EPS downloads, with print-ready PDFs at exact sizes",
    "Dynamic QR codes with editable destinations and scan analytics",
    "Hosted mobile pages: link lists, business pages, vCards, menus, coupons, events, forms, PDFs, images, audio and video",
    "Smart routing by device, country, language and time, A/B tests and UTM tags",
    "Passwords, start and expiry dates, scan limits and fallback URLs",
    "Custom domains for short links",
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
  author: {
    "@type": "Person",
    name: "Ritesh Bucha",
    url: "https://github.com/bucharitesh",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": organizationId,
  name: siteName,
  url: url("/"),
  logo: url("/logo.png"),
  description:
    "Open-source QR code platform: a free QR code generator, dynamic QR codes with hosted pages and scan analytics, and developer tools.",
  email: "support@qrdx.dev",
  foundingDate: "2024",
  sameAs: ["https://github.com/bucharitesh/qrdx"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "support@qrdx.dev",
  },
};

// No SearchAction: the site has no search results URL (docs search is a dialog).
const webSiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  url: url("/"),
  publisher: { "@id": organizationId },
  description:
    "Free QR code generator with dynamic QR codes, hosted pages, scan analytics and developer tools. Open source.",
};

export default function Home() {
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
          __html: JSON.stringify(organizationSchema),
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
        <UseCasesSection />
        <AsciiDivider />
        <FeatureRowsSection />
        <AsciiDivider />
        <HeroVideoSection />
        <FAQSection />
      </main>
    </>
  );
}
