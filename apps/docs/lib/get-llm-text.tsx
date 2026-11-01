import type { Page } from "@/lib/source";
import { owner, repo } from "./github";

/** "developers" → "Developers"; nested docs keep their section as context. */
function sectionOf(page: Page): string | null {
  if (page.slugs.length < 2) return null;
  const [first] = page.slugs;
  return first.charAt(0).toUpperCase() + first.slice(1).replaceAll("-", " ");
}

/** One docs page as Markdown (llms-full.txt and the per-page .mdx links). */
export async function getLLMText(page: Page) {
  const processed = await page.data.getText("processed");
  const section = sectionOf(page);
  const title = section ? `${page.data.title} (${section})` : page.data.title;

  return [
    `# ${title}`,
    `URL: ${page.url}`,
    `Source: https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/main/apps/docs/content/docs/${page.path}`,
    "",
    page.data.description ?? "",
    "",
    processed,
  ].join("\n");
}
