import { llmsTxt } from "@/lib/agents/llms-content";

// The site index for LLMs (llmstxt.org), built in lib/agents/llms-txt.ts.
// Rebuilt hourly at most, because it notes when npm lags the repo.
export const revalidate = 3600;

export async function GET() {
  return new Response(await llmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
