// Site-wide structured data. The Organization node goes on QRdx's own pages
// (marketing, docs, the playground) through their layouts, not the root
// layout: hosted pages under /p, on customers' own domains and white-label
// on Business, must not carry QRdx's identity.
//
// Facts only. No ratings or reviews until real ones exist on G2 or
// Capterra, and `sameAs` lists only profiles that exist today: add Product
// Hunt, AlternativeTo or Wikidata URLs once they're live.
import {
  CANONICAL_HOST,
  GITHUB_PROFILE_URL,
  GITHUB_REPO_URL,
  NPM_CLI_URL,
  NPM_LIBRARY_URL,
  SUPPORT_EMAIL,
  X_PROFILE_URL,
} from "@repo/config";
import { CHROME_WEB_STORE_URL } from "@repo/integrations/src/catalog/entries/plugins";
import { baseUrl, siteName } from "@/lib/metadata";

const url = (path: string): string => new URL(path, baseUrl).toString();

/** `@id` other schema nodes use to point at QRdx (publisher, provider). */
export const organizationId = url("/#organization");

export const founderSchema = {
  "@type": "Person",
  "@id": url("/#founder"),
  name: "Ritesh Bucha",
  url: url("/blog/authors/ritesh-bucha"),
  sameAs: [GITHUB_PROFILE_URL, X_PROFILE_URL],
};

/**
 * Other names for the site, on the home page's WebSite node. "QRDX" is also
 * a blockchain and a Japanese QR product, so the domain and what QRdx does
 * tell them apart.
 */
export const webSiteAlternateNames = ["QRdx QR code generator", CANONICAL_HOST];

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": organizationId,
  name: siteName,
  // Another product is called QRDX; the domain tells them apart.
  alternateName: CANONICAL_HOST,
  url: url("/"),
  logo: {
    "@type": "ImageObject",
    url: url("/logo.png"),
    width: 512,
    height: 512,
  },
  description:
    "Open-source QR code platform: a free QR code generator, dynamic QR codes with hosted pages and scan analytics, and developer tools.",
  email: SUPPORT_EMAIL,
  // The GitHub repository was created on 30 Oct 2025.
  foundingDate: "2025",
  founder: founderSchema,
  sameAs: [
    GITHUB_REPO_URL,
    NPM_LIBRARY_URL,
    NPM_CLI_URL,
    CHROME_WEB_STORE_URL,
    // The official MCP Registry's record and Glama's page for the MCP server.
    "https://registry.modelcontextprotocol.io/v0/servers/io.github.bucharitesh%2Fqrdx/versions/latest",
    "https://glama.ai/mcp/connectors/io.github.bucharitesh/qrdx",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: SUPPORT_EMAIL,
  },
};
