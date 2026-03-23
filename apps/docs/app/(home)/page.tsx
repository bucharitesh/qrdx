import { FAQSection } from "@/components/sections/faq-section";
import { HeroSection } from "@/components/sections/hero-section";

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "QRdx",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Web",
  url: "https://qrdx.dev",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free forever with unlimited QR code generation",
  },
  description:
    "Free unlimited QR code generator with AI-powered customization. No signup required. Custom colors, logos, 29 dot pattern combinations, analytics, and an embeddable React component. Open-source (MIT licensed).",
  featureList: [
    "Unlimited free QR code generation",
    "No signup or account required",
    "AI-powered theme generation",
    "29 dot pattern combinations",
    "Linear and radial gradient colors",
    "Logo overlay support",
    "Real-time scan analytics",
    "React/TypeScript npm component",
    "No ads or watermarks",
    "Self-hostable",
    "Open-source (MIT)",
  ],
  screenshot: "https://qrdx.dev/og-image.png",
  softwareVersion: "latest",
  author: {
    "@type": "Person",
    name: "Ritesh Bucha",
    url: "https://github.com/bucharitesh",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "5",
    ratingCount: "1",
    bestRating: "5",
    worstRating: "1",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "QRdx",
  url: "https://qrdx.dev",
  logo: "https://qrdx.dev/favicon-96x96.png",
  description:
    "Open-source QR code infrastructure for designers, businesses, and developers. Free, unlimited, and AI-powered.",
  email: "support@qrdx.app",
  foundingDate: "2024",
  sameAs: ["https://github.com/bucharitesh/qrdx"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "support@qrdx.app",
  },
};

const webSiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "QRdx",
  url: "https://qrdx.dev",
  description:
    "Free unlimited QR code generator — no signup required. AI-powered customization, open-source, and developer-first.",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://qrdx.dev/docs?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
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
        <FAQSection />
      </main>
    </>
  );
}
