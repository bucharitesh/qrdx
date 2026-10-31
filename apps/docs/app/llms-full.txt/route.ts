import { getLLMText } from "@/lib/get-llm-text";
import { baseUrl } from "@/lib/metadata";
import { source } from "@/lib/source";

export const revalidate = false;

export async function GET() {
  const scan = source.getPages().map(getLLMText);
  const scanned = await Promise.all(scan);

  const header = `# QRdx documentation (full text)\n\nComplete docs for QRdx, the open-source (AGPL-3.0) QR code generator: static QR code design and export, dynamic QR codes with hosted pages, smart routing, analytics, custom domains, teams, notifications and webhooks, plans and limits, and the developer tools (qrdx React library, @qrdx/cli, image API, REST API with OAuth, MCP server, shadcn/ui registry) and self-hosting. Page URLs below are relative to ${baseUrl.origin}. Index with product, pricing and tool links: ${new URL("/llms.txt", baseUrl).toString()}`;

  return new Response([header, ...scanned].join("\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
