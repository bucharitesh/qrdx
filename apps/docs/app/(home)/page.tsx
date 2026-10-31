import type { Metadata } from "next";
import { FAQSection } from "@/components/sections/faq-section";
import { HeroSection } from "@/components/sections/hero-section";
import { HeroVideoSection } from "@/components/sections/hero-video-section";
import { FeatureRowsSection } from "@/components/sections/home/feature-rows-section";
import { UseCasesSection } from "@/components/sections/home/use-cases-section";
import {
  baseUrl,
  createMetadata,
  defaultOgImage,
  siteDescription,
  siteName,
  siteTitle,
} from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: { absolute: siteTitle },
  description: siteDescription,
  path: "/",
});

const url = (path: string): string => new URL(path, baseUrl).toString();

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteName,
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  url: url("/"),
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free plan with unlimited static QR code generation",
  },
  description:
    "Free QR code generator with custom colors, gradients, logos and 29 pattern styles. No signup or watermark. AI-designed themes, an embeddable React component, and open-source code (AGPL-3.0).",
  featureList: [
    "Unlimited free static QR code generation",
    "No signup required to create and download",
    "PNG, JPG and SVG export",
    "29 pattern styles (body dots, corner eyes, eye dots)",
    "Linear and radial gradient colors",
    "Logo overlay support",
    "AI-designed QR code themes",
    "React/TypeScript npm component",
    "No ads or watermarks",
    "Self-hostable",
    "Open source (AGPL-3.0)",
  ],
  screenshot: url(defaultOgImage.url),
  softwareVersion: "latest",
  license: "https://www.gnu.org/licenses/agpl-3.0.html",
  author: {
    "@type": "Person",
    name: "Ritesh Bucha",
    url: "https://github.com/bucharitesh",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteName,
  url: url("/"),
  logo: url("/logo.png"),
  description:
    "Open-source QR code generator and developer library for designers, businesses and developers.",
  email: "support@qrdx.dev",
  foundingDate: "2024",
  sameAs: ["https://github.com/bucharitesh/qrdx"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "support@qrdx.dev",
  },
};

const webSiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  url: url("/"),
  description:
    "Free QR code generator — no signup required. Open source, AI-assisted design, and developer-first.",
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
        <FeatureRowsSection />
        <HeroVideoSection />
        <FAQSection />
      </main>
    </>
  );
}
