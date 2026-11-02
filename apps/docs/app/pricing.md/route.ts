import { siteConfig } from "@/config/site";
import { pricingOptions } from "@/lib/agents/llms-content";
import { pricingMarkdown } from "@/lib/agents/markdown-pages";
import { baseUrl } from "@/lib/metadata";
import { PLAN_LIMITS } from "@/lib/plans";

// /pricing as Markdown for agents, from the data the page renders. Requests
// for /pricing that ask for text/markdown are rewritten here (next.config.ts).
export const revalidate = false;

export function GET() {
  return new Response(
    pricingMarkdown({
      origin: baseUrl,
      limits: PLAN_LIMITS,
      offered: pricingOptions(),
      faqs: siteConfig.pricing.faq,
    }),
    { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
  );
}
