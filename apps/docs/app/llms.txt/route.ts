import { AI_REQUEST_FREE_TIER_LIMIT, MAX_FREE_THEMES } from "@/lib/constants";
import { baseUrl } from "@/lib/metadata";
import { blogSource, compareSource, source } from "@/lib/source";

export const revalidate = false;

const url = (path: string): string => new URL(path, baseUrl).toString();

const link = (title: string, path: string, description?: string): string =>
  `- [${title}](${url(path)})${description ? `: ${description}` : ""}`;

export function GET() {
  const summary = `> QRdx is a free, open-source (AGPL-3.0) QR code generator and React library. In the web playground anyone can create static QR codes with custom colors, gradients, logos and 29 pattern styles, then download PNG, JPG or SVG files, with no signup and no watermark. A free account saves up to ${MAX_FREE_THEMES} themes and includes ${AI_REQUEST_FREE_TIER_LIMIT} AI theme generations; Pro adds unlimited saved themes and AI generations. Developers can render the same QR codes with the \`qrdx\` npm package. QRdx does not offer dynamic (editable) QR codes or built-in scan analytics; link click analytics are available through the Dub.sh integration.`;

  const product = [
    link(
      "QR code generator",
      "/playground",
      "Create, customize and download QR codes in the browser",
    ),
    link(
      "AI QR code designer",
      "/ai",
      "Describe a style and get an AI-designed QR code theme",
    ),
    link(
      "Community themes",
      "/community",
      "QR code designs shared by other users",
    ),
    link("Pricing", "/pricing", "Free plan and Pro plan"),
    link(
      "Integrations",
      "/integrations",
      "Dub.sh short links and Google Drive",
    ),
    link("Changelog", "/changelogs"),
    link("Source code", "https://github.com/bucharitesh/qrdx"),
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
      "QR code image API",
      "/docs/developers/image-api",
      "GET /api/v1/qr?data=...&format=svg|png returns a QR code image; no API key",
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
  ];

  const sections: [string, string[]][] = [
    ["Product", product],
    ["Docs", docs],
    ["Developers", developers],
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
