import type {
  CatalogCapability,
  CatalogLogo,
  IntegrationCatalogEntry,
} from "../types";

interface PixelSpec {
  slug: string;
  name: string;
  /** What the provider calls the value, e.g. "measurement ID". */
  idName: string;
  idFormat: string;
  example: string;
  logo: CatalogLogo;
  website: string;
  use: string;
  keywords: string[];
}

const PIXEL_CAPABILITIES: CatalogCapability[] = [
  {
    title: "Consent first",
    description:
      "Visitors in the EU/EEA, the UK and Switzerland, or with an unknown location, choose Accept or Decline before anything loads.",
  },
  {
    title: "Per code",
    description:
      "Each hosted page loads only the pixels you set on that code, alongside QRdx's cookieless scan analytics.",
  },
  {
    title: "No extra scripts",
    description: "QRdx adds no third-party scripts of its own to hosted pages.",
  },
];

const PIXELS: PixelSpec[] = [
  {
    slug: "google-analytics",
    name: "Google Analytics 4",
    idName: "measurement ID",
    idFormat: "G-XXXXXXXXXX",
    example: "G-1A2B3C4D5E",
    logo: { type: "image", src: "/integrations/google-analytics.svg" },
    website: "https://marketingplatform.google.com/about/analytics/",
    use: "See visits from your QR codes' hosted pages in your own Google Analytics property, next to the rest of your site.",
    keywords: ["ga4", "google", "gtag", "analytics", "pixel", "tracking"],
  },
  {
    slug: "google-tag-manager",
    name: "Google Tag Manager",
    idName: "container ID",
    idFormat: "GTM-XXXXXXX",
    example: "GTM-AB12CD3",
    logo: { type: "image", src: "/integrations/google-tag-manager.svg" },
    website: "https://tagmanager.google.com",
    use: "Load your Tag Manager container on hosted pages and manage every tag from Google Tag Manager.",
    keywords: ["gtm", "google", "tags", "container", "pixel", "tracking"],
  },
  {
    slug: "meta-pixel",
    name: "Meta Pixel",
    idName: "pixel ID",
    idFormat: "6–20 digits",
    example: "123456789012345",
    logo: { type: "image", src: "/integrations/meta.svg" },
    website: "https://www.facebook.com/business/tools/meta-pixel",
    use: "Build Facebook and Instagram retargeting audiences from the people who scan your codes.",
    keywords: ["facebook", "instagram", "meta", "retargeting", "pixel", "ads"],
  },
  {
    slug: "tiktok-pixel",
    name: "TikTok Pixel",
    idName: "pixel ID",
    idFormat: "10–30 letters and digits",
    example: "C4ABCDEF1234567890AB",
    logo: { type: "image", src: "/integrations/tiktok.svg" },
    website: "https://ads.tiktok.com",
    use: "Retarget the people who scan your codes with TikTok ads.",
    keywords: ["tiktok", "retargeting", "pixel", "ads"],
  },
  {
    slug: "linkedin-insight-tag",
    name: "LinkedIn Insight Tag",
    idName: "partner ID",
    idFormat: "3–12 digits",
    example: "1234567",
    logo: { type: "image", src: "/integrations/linkedin.svg" },
    website: "https://business.linkedin.com/marketing-solutions/insight-tag",
    use: "Measure and retarget B2B audiences from event booths, brochures and other print.",
    keywords: ["linkedin", "b2b", "insight", "retargeting", "pixel", "ads"],
  },
];

export const analytics: IntegrationCatalogEntry[] = PIXELS.map((pixel) => ({
  slug: pixel.slug,
  name: pixel.name,
  tagline: `Load your ${pixel.name} on the hosted pages your QR codes open.`,
  description: [
    pixel.use,
    `Paste your ${pixel.idName} (${pixel.idFormat}) on a dynamic code that opens a hosted page. The tag only loads after the visitor agrees where consent is required.`,
  ],
  kind: "native",
  surface: "integrations",
  categories: ["analytics"],
  logo: pixel.logo,
  plan: "pro",
  builtBy: "QRdx",
  website: pixel.website,
  docs: "/docs/tracking-and-conversions#tracking-pixels-on-hosted-pages-pro",
  primaryAction: {
    type: "link",
    label: "Open your codes",
    href: "/dashboard/codes",
  },
  secondaryAction: {
    type: "link",
    label: "Read the docs",
    href: "/docs/tracking-and-conversions#tracking-pixels-on-hosted-pages-pro",
  },
  steps: [
    {
      title: "Open a code that has a hosted page",
      body: "In the dashboard, open a dynamic code that opens a landing page, form or other hosted page, and go to its Settings.",
    },
    {
      title: `Paste your ${pixel.idName}`,
      body: `In the Tracking pixels panel, enter it in the ${pixel.name} field.`,
      snippet: {
        label: `${pixel.idName[0]?.toUpperCase()}${pixel.idName.slice(1)} (${pixel.idFormat})`,
        language: "text",
        code: pixel.example,
      },
    },
    {
      title: "Choose when to ask for consent and save",
      body: "“Where required” (the default) asks visitors in the EU/EEA, the UK, Switzerland and unknown locations first; “For every visitor” asks everyone.",
    },
  ],
  capabilities: PIXEL_CAPABILITIES,
  keywords: pixel.keywords,
}));
