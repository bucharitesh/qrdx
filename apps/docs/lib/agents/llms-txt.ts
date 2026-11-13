// /llms.txt (llmstxt.org): an H1, a one-paragraph summary in a blockquote,
// a few key facts, then H2 sections of links. Every number comes from the
// catalogues (lib/product-facts.ts, lib/plans.ts, lib/pricing.ts, …), every
// link is absolute, and pages for features this deployment can't offer are
// left out. Pure: app/llms.txt/route.ts passes in the content-collection
// pages and what this deployment offers; tests/lib/agents.test.ts checks it.
import {
  buildHighlights,
  type PricingOptions,
} from "@/components/sections/pricing/plan-content";
import { MAX_BULK_ROWS } from "@/components/sections/tools/bulk-utils";
import { BARCODE_FORMATS } from "@/lib/barcode/formats";
import { ENTERPRISE_ADDS } from "@/lib/enterprise";
import { claudeCodeCommand, mcpServerUrl } from "@/lib/mcp-clients";
import type { PlanLimits } from "@/lib/plans";
import {
  formatPrice,
  localPricesNote,
  type PaidPlan,
  PLAN_NAMES,
  type Plan,
  PRICING,
} from "@/lib/pricing";
import { PRODUCT_FACTS, STYLE_SUMMARY } from "@/lib/product-facts";
import { getQrTypeTitle, QR_TYPES } from "@/lib/qr-types-content";
import { industries, placements } from "@/lib/seo-content";
import { apiBaseUrl, imageApiUrl } from "./hosts";
import { OPENAPI_PATH } from "./well-known";

export interface LlmsLink {
  title: string;
  /** Root-relative ("/docs/x") or absolute. */
  url: string;
  description?: string;
}

export interface LlmsDocsSection {
  /** The docs tab ("Help", "Guides", …); "" for /docs itself. */
  title: string;
  pages: LlmsLink[];
}

/** An npm package: the version in this repo and the one npm installs. */
export interface NpmRelease {
  name: string;
  repo: string;
  /** npm's `latest`; null when the registry couldn't be reached. */
  published: string | null;
}

export interface LlmsTxtInput {
  origin: URL;
  /** Pricing and product lines for features this deployment can't offer go. */
  offered: PricingOptions;
  /** False for links to pages this deployment hides (lib/feature-availability). */
  showsPath: (path: string) => boolean;
  limits: Record<Plan, PlanLimits>;
  docs: LlmsDocsSection[];
  blog: LlmsLink[];
  compare: LlmsLink[];
  legal: LlmsLink[];
  integrations: LlmsLink[];
  plugins: LlmsLink[];
  npm: { library: NpmRelease; cli: NpmRelease };
}

/** The H2 sections, in order (tests check them). */
export const LLMS_SECTIONS = [
  "Product",
  "Playground and tools",
  "Developers",
  "Docs",
  "Help center",
  "Pricing",
  "Legal",
  "Optional",
] as const;

const HELP_TAB = "Help";

export function buildLlmsTxt(input: LlmsTxtInput): string {
  const { origin, offered, showsPath } = input;
  const on = (feature: keyof PricingOptions) => offered[feature] !== false;
  const abs = (path: string) => new URL(path, origin).toString();
  const isSite = (url: string) => url.startsWith("/");
  const link = ({ title, url, description }: LlmsLink) =>
    `- [${title}](${isSite(url) ? abs(url) : url})${description ? `: ${description}` : ""}`;
  const links = (items: (LlmsLink | false)[]) =>
    items
      .filter((item): item is LlmsLink => Boolean(item))
      .filter((item) => !isSite(item.url) || showsPath(item.url))
      .map(link);

  const mcpUrl = mcpServerUrl(origin);
  const api = apiBaseUrl(origin);
  const exampleImage = imageApiUrl(origin, {
    data: "https://qrdx.dev",
    format: "svg",
  });
  const npmNote = ({ name, repo, published }: NpmRelease) =>
    published && published !== repo
      ? ` npm's latest is ${name}@${published}; these docs describe ${repo}, which isn't on npm yet.`
      : "";

  const summary = `> QRdx (qrdx.dev) is an open-source (AGPL-3.0) QR code platform. Anyone can design static QR codes in the browser with no signup or watermark (${STYLE_SUMMARY}, ${PRODUCT_FACTS.frames} frames, gradients, logos, and Logo QR or Image QR art) and download PNG, JPG, WebP, SVG, PDF or EPS files. A free account adds dynamic QR codes you can change after printing, with scan analytics and hosted mobile pages; paid plans add smart routing, link controls, ${on("customDomains") ? "custom domains, " : ""}teams and webhooks. Developers get a REST API, a keyless QR image API, a remote MCP server, a CLI, a React library and a shadcn/ui registry.`;

  const facts = [
    "Key facts:",
    "",
    "- Static QR codes are free and need no account. The content is in the code itself, so they never expire and have no scan limits.",
    `- Dynamic QR codes: scans are unlimited on every plan and never paused. Under the [Never-Hostage Guarantee](${abs("/guarantee")}), every code keeps redirecting after a downgrade, a failed payment or a cancellation.`,
    `- For AI agents: connect the MCP server at \`${mcpUrl}\` (Streamable HTTP, no key), or build image URLs like \`${api}/qr?data=…\` (no key). The REST API at \`${api}\` takes a workspace API key (\`Authorization: Bearer qrdx_…\`, created in Settings; see ${abs("/docs/developers/api-keys")}) or an OAuth 2.0 access token. Its OpenAPI 3.1 document is at ${abs(OPENAPI_PATH)}.`,
    `- Free QR code API, no key: \`GET ${api}/qr?data=…\` returns an SVG, PNG, WebP or EPS QR code with no account or signup, at up to ${PRODUCT_FACTS.imageApiPerMinute} requests a minute per IP address; identical URLs are cached for a year. URL builder: ${abs("/qr-code-api")}.`,
    `- Can Claude or ChatGPT make a QR code that scans? Yes, with the QRdx MCP server at \`${mcpUrl}\`: free, no key, and the codes it renders are standard QR codes (a chat model drawing one itself rarely scans).`,
    `- What's free: unlimited static QR codes with no account. A free account adds ${input.limits.free.dynamicCodes} dynamic codes and ${input.limits.free.landingPages} hosted pages, with unlimited scans.`,
    "- When to choose something else: QRdx has no SOC 2 or HIPAA certification, so teams that need that paperwork may prefer Uniqode. It isn't a general link shortener for links shared online (it integrates with Dub for that), and Bitly suits teams whose links already live there. Placing a code inside a larger design is simplest in Canva. Native CRM or CDP integrations point to Flowcode, a custom-quoted Enterprise tier with its own limits to Scanova, and a native scanner app to QR TIGER. For a dependency-free React component with a long track record, qrcode.react is more mature: the qrdx library is pre-1.0 and React-first.",
    `- Markdown versions: add \`.md\` to any docs URL (for example ${abs("/docs/developers/mcp.md")}); ${abs("/pricing.md")} and ${abs("/mcp.md")} are Markdown too, and ${abs("/llms-full.txt")} has every docs page in one file.`,
  ].join("\n");

  const product = links([
    {
      title: "Dynamic QR codes",
      url: "/docs/dynamic-qr-codes",
      description: `Short links you can point somewhere else after printing, with scan analytics, folders, tags, version history and trash; a CSV import of up to ${PRODUCT_FACTS.importRows} codes and API batches of up to ${PRODUCT_FACTS.apiBatchCodes} (with an Idempotency-Key) on paid plans`,
    },
    {
      title: "Hosted pages",
      url: "/docs/landing-pages",
      description:
        "Mobile pages at /p/<slug>: link lists, social profiles, business pages, contact cards, menus, coupons, events, app links, forms, product pages, appointments, payments and tips, property listings, pet ID tags, medical IDs, PDFs, images, audio, playlists and video",
    },
    {
      title: "Product pages and GS1 Digital Link",
      url: "/docs/product-pages",
      description:
        "Ingredients, nutrition, certifications and care for a product; on a custom domain, https://<domain>/01/<GTIN> opens the page",
    },
    {
      title: "Forms",
      url: "/docs/forms-and-pages",
      description: "Collect answers on a hosted page",
    },
    {
      title: "Smart routing",
      url: "/docs/smart-routing",
      description:
        "Send scans to different links by device, country, language, time or scan count; A/B tests and UTM tags",
    },
    {
      title: "Precise location and geofencing",
      url: "/docs/precise-location",
      description:
        "Opt-in GPS scan locations (rounded to about 100 m, Pro and Business) and routing by area",
    },
    {
      title: "Code controls",
      url: "/docs/code-controls",
      description: "Passwords, schedules, expiry dates and scan limits",
    },
    {
      title: "Analytics and conversions",
      url: "/docs/tracking-and-conversions",
      description: "Scan analytics, retargeting pixels and conversion tracking",
    },
    // NFC (feat/nfc)
    {
      title: "NFC tags and business cards",
      url: "/docs/nfc",
      description:
        "Write a dynamic code's link to an NFC tag or card; taps are counted apart from QR scans",
    },
    {
      title: "Teams",
      url: "/docs/teams",
      description: "Shared workspaces with owner, admin and member roles",
    },
    on("customDomains") && {
      title: "Custom domains",
      url: "/docs/custom-domains",
      description: "Serve short links from your own domain",
    },
    on("fileStorage") && {
      title: "File hosting",
      url: "/docs/files",
      description: "Upload PDFs, images and audio for codes and pages",
    },
    {
      title: "Import from other services",
      url: "/docs/migrate",
      description: "Bring links from Bitly, Rebrandly and others",
    },
    on("aiThemes") && {
      title: "AI theme designer",
      url: "/ai",
      description: "Describe a style and get a QR code theme",
    },
    on("aiArt") && {
      title: "AI QR code art",
      url: "/ai/art",
      description: "Artwork that still scans; needs an account",
    },
    {
      title: "Page templates",
      url: "/templates",
      description: "Live demos of every hosted page template",
    },
    {
      title: "Community themes",
      url: "/community",
      description: "QR code designs shared by other people",
    },
    {
      title: "Integrations",
      url: "/integrations",
      description:
        "Chat alerts, Zapier, Make and n8n, short links, file storage, CRMs and analytics pixels",
    },
    {
      title: "Plugins",
      url: "/plugins",
      description: "QRdx for Chrome, Figma, Raycast and Canva",
    },
    // Each bot's page is left out where that bot isn't set up (showsPath).
    {
      title: "Slack bot",
      url: "/slack",
      description:
        "QR codes in Slack with /qr, mentions, direct messages and a message shortcut; tracked codes with a linked account",
    },
    {
      title: "Telegram bot",
      url: "/telegram",
      description:
        "QR codes in Telegram: message the bot, call it inline in any chat, or use /qr in a group; no account",
    },
    {
      title: "Discord bot",
      url: "/discord",
      description:
        "QR codes in Discord with /qr or a message's Apps menu, in servers and DMs; no account",
    },
    { title: "Changelog", url: "/changelogs" },
    {
      title: "Source code",
      url: "https://github.com/bucharitesh/qrdx",
      description: "The whole platform, open source and self-hostable",
    },
  ]);

  const tools = links([
    {
      title: "Playground (QR code generator)",
      url: "/playground",
      description: `Design and download static QR codes in the browser with no signup: ${STYLE_SUMMARY}, ${PRODUCT_FACTS.frames} frames, colors, gradients, logos and a scan score`,
    },
    { title: "All free tools", url: "/tools" },
    {
      title: "Bulk QR code generator",
      url: "/tools/bulk",
      description: `Up to ${MAX_BULK_ROWS.toLocaleString("en-US")} styled codes from a CSV, as a ZIP; runs in the browser`,
    },
    {
      title: "QR code scanner",
      url: "/scan",
      description:
        "Scan with a camera or from an image, with a safe-link preview",
    },
    {
      title: "Scan checker",
      url: "/tools/scan-checker",
      description: "Test how reliably a QR code image scans",
    },
    {
      title: "Print size calculator",
      url: "/tools/print-size",
      description: "Minimum print size for a scan distance",
    },
    {
      title: "Barcode generator",
      url: "/barcode-generator",
      description: `${PRODUCT_FACTS.barcodeFormats} static barcode formats (${BARCODE_FORMATS.map((format) => format.label).join(", ")}) with check digits and a scan check, as PNG, JPG, WebP, AVIF, SVG, PDF or EPS; no account needed, and signed in you can save barcodes to the dashboard`,
    },
    {
      title: "QR code generators by type",
      url: "/qr-code-generator",
      description: `${QR_TYPES.length} content types`,
    },
    ...QR_TYPES.map((type) => ({
      title: getQrTypeTitle(type),
      url: `/qr-code-generator/${type.type}`,
      description: type.summary,
    })),
  ]);

  const developers = links([
    {
      title: "Use QRdx with AI agents",
      url: "/docs/developers/ai-agents",
      description:
        "MCP setup for Claude, ChatGPT, Cursor, VS Code and Devin Desktop (formerly Windsurf), install links, the image API for agents, REST API auth and limits",
    },
    {
      title: "REST API",
      url: "/docs/developers/rest-api",
      description: `Dynamic codes, scan analytics, conversions, webhook subscriptions and themes under ${api}, with a workspace API key or an OAuth 2.0 access token (authorization code with PKCE)`,
    },
    {
      title: "API keys",
      url: "/docs/developers/api-keys",
      description:
        "qrdx_ keys for your own servers and scripts: scopes, workspaces and roles, expiry and revoking",
    },
    {
      title: "OpenAPI document",
      url: OPENAPI_PATH,
      description:
        "OpenAPI 3.1 description of every REST API endpoint, with schemas, errors and scopes",
    },
    {
      title: "API reference",
      url: "/docs/developers/api",
      description: "One page per endpoint, generated from the OpenAPI document",
    },
    {
      title: "Webhooks",
      url: "/docs/webhooks",
      description:
        "Signed events for scans, code changes and form answers; REST Hooks for Zapier, Make and n8n",
    },
    {
      title: "MCP server",
      url: "/docs/developers/mcp",
      description: `Remote MCP endpoint \`${mcpUrl}\` (Streamable HTTP, no account or key, read-only tools that render QR codes and barcodes and build Wi-Fi, contact, email, SMS and map payloads). Claude Code: \`${claudeCodeCommand(mcpUrl)}\``,
    },
    {
      title: "Connect an AI app to the MCP server",
      url: "/mcp",
      description:
        "One-click buttons for Claude, Cursor and VS Code, and configs for other apps",
    },
    {
      title: "AI Catalog",
      url: "/.well-known/ai-catalog.json",
      description: `Discovery document that points to the MCP Server Card at \`${mcpUrl}/server-card\``,
    },
    {
      title: "Free QR code API",
      url: "/qr-code-api",
      description:
        "Live URL builder for the keyless image API, with copy-ready HTML, Markdown and curl, its limits and caching",
    },
    {
      title: "QR code image API",
      url: "/docs/developers/image-api",
      description: `\`GET ${api}/qr?data=…\` returns an SVG, PNG, WebP or EPS QR code; no key; gradients, frames, borders and logo icons through \`style\` (the editor's style JSON)`,
    },
    // Barcodes (lib/barcode, lib/barcodes)
    {
      title: "Barcode API",
      url: "/docs/developers/barcode-api",
      description: `\`GET ${api}/barcode?format=ean13&data=…\` returns an SVG, PNG, JPG, WebP, AVIF, PDF or EPS barcode in ${PRODUCT_FACTS.barcodeFormats} formats, with check digits worked out or verified; no key. Saved barcodes under \`${api}/barcodes\` with an API key`,
    },
    {
      title: "Example image API URL",
      url: exampleImage,
      description: "An SVG QR code for https://qrdx.dev",
    },
    {
      title: "CLI",
      url: "/docs/developers/cli",
      description: `\`npx @qrdx/cli generate "https://example.com" -o qr.svg\`: styled codes from a terminal or CI, and \`qrdx batch codes.csv\` for a code per CSV row with no row limit.${npmNote(input.npm.cli)}`,
    },
    {
      title: "React library",
      url: "/docs/getting-started",
      description: `\`npm install qrdx\`: SVG and canvas QR code components, export and scan scoring.${npmNote(input.npm.library)}`,
    },
    {
      title: "shadcn/ui registry",
      url: "/docs/developers/shadcn",
      description: `\`npx shadcn@latest add ${abs("/r/qr-code.json")}\``,
    },
    {
      title: "Build an integration",
      url: "/docs/developers/build-an-integration",
      description: "OAuth apps for third-party integrations",
    },
    {
      title: "API catalog",
      url: "/.well-known/api-catalog",
      description: "RFC 9727 list of the APIs with their descriptions",
    },
    {
      title: "Self-hosting",
      url: "/docs/self-hosting",
      description: "Run the whole app with Docker Compose or Node.js",
    },
  ]);

  const docsLinks = (sections: LlmsDocsSection[]) =>
    links(
      sections.flatMap((section) =>
        section.pages.map((page) => ({
          ...page,
          description:
            section.title && page.description
              ? `${section.title}. ${page.description}`
              : (page.description ?? section.title),
        })),
      ),
    );
  const docs = docsLinks(input.docs.filter((s) => s.title !== HELP_TAB));
  const help = links(
    input.docs
      .filter((section) => section.title === HELP_TAB)
      .flatMap((section) => section.pages),
  );

  const price = (plan: PaidPlan) =>
    `${formatPrice(PRICING[plan].month.amounts.USD, "USD")} a month or ${formatPrice(PRICING[plan].year.amounts.USD, "USD")} a year (${localPricesNote(plan)})`;
  const highlights = buildHighlights(input.limits, offered);
  const planLine = (plan: Plan, cost: string, lead = "") => ({
    title: `${PLAN_NAMES[plan]} plan`,
    url: "/pricing",
    description: `${cost}. ${lead}${highlights[plan].join(". ")}.`,
  });
  const pricing = links([
    planLine("free", formatPrice(0, "USD")),
    planLine("pro", price("pro")),
    planLine("business", price("business"), "Everything in Pro, plus: "),
    {
      title: "Enterprise",
      url: "/enterprise",
      description: `Custom price: the Business plan under a contract. Everything in Business, plus: ${ENTERPRISE_ADDS.join(". ")}. No uptime guarantee`,
    },
    {
      title: "Pricing as Markdown",
      url: "/pricing.md",
      description: "Every limit of every plan in one table",
    },
    {
      title: "Never-Hostage Guarantee",
      url: "/guarantee",
      description:
        "Codes keep working after a downgrade, a failed payment or a cancellation, with no ads or interstitials",
    },
    {
      title: "Plans and limits",
      url: "/docs/plans-and-limits",
      description: "What happens at each limit, and API quotas",
    },
  ]);

  const legal = links([
    {
      title: "Security at QRdx",
      url: "/security",
      description:
        "Sign-in protections, single sign-on, the audit log, link checks, where data is stored and how to report a vulnerability. No SOC 2 or HIPAA certification",
    },
    ...input.legal,
    {
      title: "Licence (the app is AGPL-3.0)",
      url: "https://github.com/bucharitesh/qrdx/blob/main/LICENSE",
    },
    {
      title: "Licence of the qrdx library and @qrdx/cli (MIT)",
      url: "https://github.com/bucharitesh/qrdx/blob/main/packages/qrdx/LICENSE",
    },
  ]);

  const optional = links([
    { title: "Full docs in one file", url: "/llms-full.txt" },
    ...input.integrations,
    ...input.plugins,
    {
      title: "QR codes by industry",
      url: industries.basePath,
      description: `Ideas, code types and print sizes for ${industries.items.length} industries`,
    },
    {
      title: "QR codes by placement",
      url: placements.basePath,
      description: `What to link and how big to print on ${placements.items.length} placements`,
    },
    { title: "All comparisons", url: "/compare" },
    ...input.compare,
    { title: "Blog", url: "/blog" },
    ...input.blog,
  ]);

  const sections: Record<(typeof LLMS_SECTIONS)[number], string[]> = {
    Product: product,
    "Playground and tools": tools,
    Developers: developers,
    Docs: docs,
    "Help center": help,
    Pricing: pricing,
    Legal: legal,
    Optional: optional,
  };

  return `${[
    "# QRdx",
    summary,
    facts,
    ...LLMS_SECTIONS.filter((name) => sections[name].length > 0).map(
      (name) => `## ${name}\n\n${sections[name].join("\n")}`,
    ),
  ].join("\n\n")}\n`;
}
