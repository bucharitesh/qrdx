// Search titles and descriptions for pages whose frontmatter `title` and
// `description` also show on the page (the H1, the intro line, the docs
// sidebar). The override changes only the search snippet and the social
// card text, not what readers see. Keyed by URL path.
//
// Comparison pages have `seoTitle` and `seoDescription` in their frontmatter;
// edit those instead. tests/lib/seo-metadata.test.ts checks every entry
// points at a real page and fits the limits below.
import type { Metadata } from "next";

/** Longer titles are cut off in results. */
export const MAX_TITLE = 60;
/** Google shows about 155–160 characters of a description. */
export const MAX_DESCRIPTION = 155;

export interface SeoOverride {
  /** Search title without the brand suffix; see brandedTitle(). */
  title?: string;
  description?: string;
}

/** The registry components, by their export names. */
const component = (name: string) => `${name} React component for shadcn/ui`;

export const SEO_OVERRIDES: Readonly<Record<string, SeoOverride>> = {
  // The sidebar calls it "QRdx docs"; searchers want to know what's inside.
  "/docs": {
    title: "QRdx Docs: QR Code Guides, API, CLI and React Library",
    description:
      "Guides to every QRdx feature: static and dynamic QR codes, hosted pages, scan analytics, the REST API, the MCP server, the CLI and the React library.",
  },

  // These share the home page's head terms ("QR code generator", "Wi-Fi QR
  // code", "vCard QR code"); developers search for the component.
  "/docs/components/qr-code": { title: component("QrCode") },
  "/docs/components/qr-code-card": { title: component("QrCodeCard") },
  "/docs/components/qr-code-download": { title: component("QrCodeDownload") },
  "/docs/components/qr-code-share-dialog": {
    title: component("QrCodeShareDialog"),
  },
  "/docs/components/qr-code-generator": {
    title: component("QrCodeGenerator"),
  },
  "/docs/components/qr-code-scanner": { title: component("QrCodeScanner") },
  "/docs/components/wifi-qr-code": { title: component("WifiQrCode") },
  "/docs/components/vcard-qr-code": { title: component("VCardQrCode") },
  "/docs/developers/build-an-integration": {
    description:
      "Create an OAuth app, connect people's QRdx accounts with OAuth 2.0 and PKCE, call the REST API for them and get listed in the integrations directory.",
  },

  "/blog/best-free-qr-code-generators-2026": {
    title: "Best Free QR Code Generators in 2026: No Signup or Watermark",
    description:
      "The best free QR code generators in 2026, compared on scan limits, watermarks and signup. See which tools really offer unlimited free QR codes.",
  },

  "/legal/dpa": {
    description:
      "How QRdx processes personal data that customers' codes, hosted pages and forms collect, under GDPR Article 28, the SCCs, India's DPDP Act and the CCPA.",
  },
  "/legal/terms-of-service": {
    description:
      "The agreement for using QRdx: accounts, dynamic codes, hosted pages, teams, the API, CLI and MCP server, AI features, billing through Polar, and leaving.",
  },
  "/legal/privacy-policy": {
    description:
      "What QRdx collects, why, who it's shared with, how long it's kept and your choices, for the website, accounts, dynamic codes, hosted pages and the API.",
  },
  "/legal/report-abuse": {
    description:
      "How to report a QRdx QR code, short link or hosted page that leads to phishing, malware, scams or other harm, and what happens after you report it.",
  },
  "/legal/ai-features": {
    description:
      "What QRdx sends to AI model providers for AI themes and AI QR art, what we keep, whether providers may train on it, and your responsibility for results.",
  },
};

export function seoOverride(path: string): SeoOverride {
  return SEO_OVERRIDES[path] ?? {};
}

/**
 * The title with the brand suffix (" | QRdx", or " | QRdx Docs"), set as an
 * absolute title so the root template doesn't add a second one. A title that
 * already names QRdx, or that the suffix would push past MAX_TITLE, goes out
 * as it is.
 */
export function brandedTitle(
  title: string,
  suffix = " | QRdx",
): NonNullable<Metadata["title"]> {
  const named = /\bqrdx\b/i.test(title);
  const fits = title.length + suffix.length <= MAX_TITLE;
  return { absolute: named || !fits ? title : `${title}${suffix}` };
}
