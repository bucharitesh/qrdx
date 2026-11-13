import { docsSections } from "@/lib/agents/docs-pages";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { getLLMText } from "@/lib/get-llm-text";
import { baseUrl } from "@/lib/metadata";

export const revalidate = false;

const url = (path: string) => new URL(path, baseUrl).toString();

/**
 * Every docs page as Markdown, in sidebar order (Introduction, Help, Guides,
 * Developers, React library, Self-hosting). Docs for features this
 * deployment can't offer are left out, and so is client-only markup (live
 * demos, tabs, cards): lib/agents/llm-markdown.ts.
 */
export async function GET() {
  const sections = docsSections();
  const pages = sections.flatMap((section) => section.pages);
  const texts = await Promise.all(pages.map(getLLMText));

  const contents = sections
    .map(
      (section) =>
        `- ${section.title || "Introduction"}: ${section.pages.length} page${section.pages.length === 1 ? "" : "s"}`,
    )
    .join("\n");
  const header = [
    "# QRdx documentation (full text)",
    "",
    `> The complete QRdx docs as Markdown: making and designing QR codes, dynamic QR codes, hosted pages and forms, smart routing, analytics, ${isFeatureAvailable("customDomains") ? "custom domains, " : ""}teams, notifications, webhooks, plans and limits, the developer tools (REST API, OpenAPI document, MCP server, image API, CLI, qrdx React library, shadcn/ui registry) and self-hosting. QRdx (qrdx.dev) is an open-source (AGPL-3.0) QR code platform.`,
    "",
    `Index of the whole site: ${url("/llms.txt")}. Each page is also available on its own at its URL plus .md.`,
    "",
    "Sections, in order:",
    "",
    contents,
  ].join("\n");

  const body = [header, ...texts.map((text) => text.trim())].join(
    "\n\n---\n\n",
  );
  return new Response(`${body}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
