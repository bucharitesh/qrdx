import { mcpMarkdown } from "@/lib/agents/markdown-pages";
import { baseUrl } from "@/lib/metadata";

// /mcp as Markdown for agents, from the page's own copy. Requests for /mcp
// (on qrdx.dev) that ask for text/markdown are rewritten here (next.config.ts).
export const revalidate = false;

export function GET() {
  return new Response(mcpMarkdown(baseUrl), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
