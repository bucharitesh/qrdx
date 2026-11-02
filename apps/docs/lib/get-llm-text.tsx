import { cleanLlmMarkdown } from "@/lib/agents/llm-markdown";
import {
  isFeatureAvailable,
  isPathAvailable,
} from "@/lib/feature-availability";
import type { FeatureId } from "@/lib/feature-availability-rules";
import { isIntegrationVisible } from "@/lib/integration-availability";
import { baseUrl } from "@/lib/metadata";
import type { Page } from "@/lib/source";
import { owner, repo } from "./github";

/** "developers" → "Developers"; nested docs keep their section as context. */
function sectionOf(page: Page): string | null {
  if (page.slugs.length < 2) return null;
  const [first] = page.slugs;
  return first.charAt(0).toUpperCase() + first.slice(1).replaceAll("-", " ");
}

/** The same test <IfAvailable> applies when it renders (components/mdx/if-available.tsx). */
function isShown({ feature, path, integration }: Record<string, string>) {
  return (
    (!feature || isFeatureAvailable(feature as FeatureId)) &&
    (!path || isPathAvailable(path)) &&
    (!integration || isIntegrationVisible(integration))
  );
}

/** The page's absolute URL. */
export const pageUrl = (page: Page) => new URL(page.url, baseUrl).toString();

/** One docs page as Markdown (llms-full.txt and the per-page .md links). */
export async function getLLMText(page: Page) {
  const processed = await page.data.getText("processed");
  const section = sectionOf(page);
  const title = section ? `${page.data.title} (${section})` : page.data.title;

  const header = [
    `# ${title}`,
    "",
    `URL: ${pageUrl(page)}`,
    `Source: https://github.com/${owner}/${repo}/blob/main/apps/docs/content/docs/${page.path}`,
    "",
  ];
  if (page.data.description) header.push(page.data.description, "");
  return `${header.join("\n")}\n${cleanLlmMarkdown(processed, {
    origin: baseUrl.origin,
    isShown,
  })}`;
}
