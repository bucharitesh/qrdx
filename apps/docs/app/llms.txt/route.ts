import { getIntegrationCatalog } from "@repo/integrations/src/catalog";
import { AI_REQUEST_FREE_TIER_LIMIT, MAX_FREE_THEMES } from "@/lib/constants";
import { env } from "@/lib/env";
import { baseUrl } from "@/lib/metadata";
import { PLAN_LIMITS } from "@/lib/plans";
import { formatPrice, type PaidPlan, PRICING } from "@/lib/pricing";
import { getQrTypeTitle, QR_TYPES } from "@/lib/qr-types-content";
import { industries, placements } from "@/lib/seo-content";
import { blogSource, compareSource, source } from "@/lib/source";

export const revalidate = false;

const url = (path: string): string => new URL(path, baseUrl).toString();

const price = (plan: PaidPlan): string =>
  `${formatPrice(PRICING[plan].month.amounts.USD, "USD")}/month or ${formatPrice(PRICING[plan].year.amounts.USD, "USD")}/year; in India ${formatPrice(PRICING[plan].month.amounts.INR, "INR")}/month or ${formatPrice(PRICING[plan].year.amounts.INR, "INR")}/year`;

const link = (title: string, path: string, description?: string): string =>
  `- [${title}](${url(path)})${description ? `: ${description}` : ""}`;

const count = (value: number): string => value.toLocaleString("en-US");

const bytes = (value: number): string =>
  value >= 1024 ** 3
    ? `${value / 1024 ** 3} GB`
    : `${Math.round(value / 1024 ** 2)} MB`;

const years = (days: number): string =>
  Number.isFinite(days) ? `${Math.round(days / 365)} years` : "unlimited";

/** "a, b and c", skipping empty entries. */
const list = (items: (string | false)[]): string => {
  const parts = items.filter((item): item is string => Boolean(item));
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
    : (parts[0] ?? "");
};

function plans(): string[] {
  const { free, pro, business } = PLAN_LIMITS;
  // AI art only runs where fal.ai is configured (lib/ai/art.ts).
  const art = (images: number) =>
    Boolean(env.FAL_KEY) && `${images} AI art images a month`;
  return [
    `- **Free** ($0): unlimited static QR codes with no account. A free account adds ${list(
      [
        `${free.dynamicCodes} dynamic QR codes`,
        `${free.landingPages} hosted pages (with a "Made with QRdx" footer)`,
        `${free.analyticsRetentionDays} days of scan analytics`,
        `${MAX_FREE_THEMES} saved themes`,
        `${AI_REQUEST_FREE_TIER_LIMIT} AI theme generations`,
        art(free.aiArtPerMonth),
        `${bytes(free.storageBytes)} of file storage`,
        `${count(free.formResponsesPerMonth)} form responses a month`,
      ],
    )}.`,
    `- **Pro** (${price("pro")}): ${list([
      "unlimited dynamic codes and hosted pages with no footer",
      `${years(pro.analyticsRetentionDays)} of analytics`,
      `${pro.customDomains} custom domains`,
      `teams of up to ${pro.teamMembers}`,
      "smart routing, A/B tests and UTM tags",
      "passwords, schedules, expiry dates and scan limits",
      "retargeting pixels",
      "email alerts and a weekly digest",
      `${bytes(pro.storageBytes)} of storage`,
      `${count(pro.formResponsesPerMonth)} form responses a month`,
      art(pro.aiArtPerMonth),
      "bulk code creation through the API",
    ])}.`,
    `- **Business** (${price("business")}): everything in Pro, plus ${list([
      "white-label hosted pages with custom CSS",
      `${years(business.analyticsRetentionDays)} analytics history`,
      `${business.customDomains} custom domains`,
      "unlimited team members",
      "conversion tracking",
      "webhooks, Zapier, Slack and Discord",
      `${bytes(business.storageBytes)} of storage`,
      `${count(business.formResponsesPerMonth)} form responses a month`,
      art(business.aiArtPerMonth) &&
        `${art(business.aiArtPerMonth)} (pooled per team)`,
    ])}.`,
    "- Scans are unlimited on every plan and never paused. Never-Hostage Guarantee: every dynamic code keeps redirecting after a downgrade, a failed payment or a cancellation, with no ads or QRdx interstitials; limits only block creating new things.",
  ];
}

export function GET() {
  const summary = `> QRdx is a free, open-source (AGPL-3.0) QR code generator, dynamic QR code platform and developer toolkit. Anyone can design static QR codes in the web playground (9 body patterns, 9 corner-eye and 11 eye-dot shapes, gradients, logos, call-to-action frames, Logo QR and Image QR art) and download PNG, JPG, SVG, PDF or EPS files, with no signup and no watermark. With an account you get dynamic QR codes (editable short links with scan analytics) that can open a website or a hosted mobile page, plus smart routing, link controls, custom domains, teams, notifications and webhooks on paid plans. Developers can use the \`qrdx\` React library, the \`@qrdx/cli\` command-line tool, a keyless QR image API, a REST API with OAuth and a remote MCP server.`;

  const product = [
    link(
      "QR code generator",
      "/playground",
      "Design, customize and download static QR codes in the browser; no signup",
    ),
    link(
      "Dynamic QR codes",
      "/docs/dynamic-qr-codes",
      "Short links you can repoint after printing, with scan analytics, folders, tags, version history and trash",
    ),
    link(
      "Hosted landing pages",
      "/docs/landing-pages",
      "Mobile pages served at /p/<slug>: link lists, business pages, vCard Plus, menus, coupons, events, app links, forms, PDFs, images, audio and video",
    ),
    link(
      "Smart routing",
      "/docs/smart-routing",
      "Route scans by device, country, language, time or scan count; A/B tests and UTM tags",
    ),
    link(
      "Teams",
      "/docs/teams",
      "Shared workspaces with owner, admin and member roles",
    ),
    link(
      "AI QR theme designer",
      "/ai",
      "Describe a style and get an AI-designed QR code theme",
    ),
    ...(env.FAL_KEY
      ? [
          link(
            "AI QR code art",
            "/ai/art",
            "Turn a link into AI artwork that still scans; needs an account",
          ),
        ]
      : []),
    link(
      "QR code scanner",
      "/scan",
      "Scan QR codes and barcodes with a camera or from an image, with a safe-link preview; installable, history stays on the device",
    ),
    link(
      "Community themes",
      "/community",
      "QR code designs shared by other users",
    ),
    link("Pricing", "/pricing", "Free, Pro and Business plans"),
    link(
      "Never-Hostage Guarantee",
      "/guarantee",
      "Codes keep working after a downgrade, failed payment or cancellation",
    ),
    link(
      "Integrations",
      "/integrations",
      "Slack, Discord, Zapier, Make, n8n, Dub, Google Drive, AI assistants, analytics pixels and more",
    ),
    link("Changelog", "/changelogs"),
    link("Source code", "https://github.com/bucharitesh/qrdx"),
  ];

  const tools = [
    link("All free tools", "/tools"),
    link(
      "Bulk QR code generator",
      "/tools/bulk",
      "Up to 5,000 styled codes from a CSV, downloaded as a ZIP; runs in the browser",
    ),
    link(
      "Scan checker",
      "/tools/scan-checker",
      "Decode a QR code image and test how reliably it scans",
    ),
    link(
      "Print size calculator",
      "/tools/print-size",
      "Minimum print size from scan distance, data length and error correction",
    ),
    link(
      "QR code generators by type",
      "/qr-code-generator",
      `${QR_TYPES.length} content types`,
    ),
    ...QR_TYPES.map((type) =>
      link(
        getQrTypeTitle(type),
        `/qr-code-generator/${type.type}`,
        type.summary,
      ),
    ),
  ];

  const integrations = getIntegrationCatalog().map((entry) =>
    link(entry.name, `/integrations/${entry.slug}`, entry.tagline),
  );

  const useCases = [
    link(
      "QR codes by industry",
      industries.basePath,
      `Ideas, code types and print sizes for ${industries.items.length} industries`,
    ),
    link(
      "QR codes by placement",
      placements.basePath,
      `What to link and how big to print on ${placements.items.length} placements, from business cards to billboards`,
    ),
  ];

  const docs = source
    .getPages()
    .map((page) =>
      link(page.data.title, page.url, page.data.description ?? undefined),
    );

  const blog = blogSource
    .getPages()
    .filter((page) => page.data.published)
    .sort(
      (a, b) =>
        new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
    )
    .map((page) =>
      link(page.data.title, page.url, page.data.description ?? undefined),
    );

  const compare = [
    link("All comparisons", "/compare"),
    ...compareSource
      .getPages()
      .map((page) =>
        link(page.data.title, page.url, page.data.description ?? undefined),
      ),
  ];

  const developers = [
    link(
      "qrdx React library",
      "/docs/getting-started",
      "npm install qrdx: SVG and canvas QR components, PNG/JPG/SVG/PDF/EPS export, print-ready PDFs, scan scoring and QR decoding",
    ),
    link(
      "CLI",
      "/docs/developers/cli",
      "npx @qrdx/cli generate <data> -o qr.svg|png|eps; styled codes from the terminal or CI",
    ),
    link(
      "QR code image API",
      "/docs/developers/image-api",
      "GET /api/v1/qr?data=...&format=svg|png|eps returns a QR code image; no API key",
    ),
    link(
      "REST API and OAuth",
      "/docs/developers/rest-api",
      "Create, edit and delete dynamic codes, read scans and report conversions under /api/v1 with OAuth 2.0 access tokens (scopes codes:read, codes:write, themes:read, profile:read)",
    ),
    link(
      "Webhooks",
      "/docs/webhooks",
      "Signed HTTPS events for scans, code changes and form submissions; REST Hooks for Zapier, Make and n8n",
    ),
    link(
      "MCP server",
      "/docs/developers/mcp",
      "Remote MCP endpoint at /api/mcp (Streamable HTTP, no auth) with QR generation and Wi-Fi/vCard/email/SMS/geo payload tools",
    ),
    link(
      "shadcn/ui registry",
      "/docs/developers/shadcn",
      `Install a QR code component: npx shadcn@latest add ${url("/r/qr-code.json")}`,
    ),
    link(
      "Self-hosting",
      "/docs/self-hosting",
      "Run the whole app, dynamic codes included, with Docker Compose or Node.js",
    ),
    link("Full docs as one text file", "/llms-full.txt"),
  ];

  const sections: [string, string[]][] = [
    ["Plans", plans()],
    ["Product", product],
    ["Developers", developers],
    ["Integrations", integrations],
    ["Tools", tools],
    ["Use cases", useCases],
    ["Docs", docs],
    ["Blog", blog],
    ["Compare", compare],
  ];

  const body = [
    "# QRdx",
    summary,
    ...sections
      .filter(([, items]) => items.length > 0)
      .map(([heading, items]) => `## ${heading}\n\n${items.join("\n")}`),
  ].join("\n\n");

  return new Response(`${body}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
