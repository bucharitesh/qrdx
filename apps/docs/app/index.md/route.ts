import { llmsTxt } from "@/lib/agents/llms-content";

// The home page as Markdown: the llms.txt overview. Requests for / that ask
// for text/markdown are rewritten here (next.config.ts).
export const revalidate = 3600;

export async function GET() {
  return new Response(await llmsTxt(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
