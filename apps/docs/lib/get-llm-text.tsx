import type { Page } from "@/lib/source";
import { owner, repo } from "./github";

export async function getLLMText(page: Page) {
  const category =
    {
      qrdx: "qrdx",
    }[page.slugs[0]] ?? page.slugs[0];

  const processed = await page.data.getText("processed");

  return `# ${category}: ${page.data.title}
URL: ${page.url}
Source: https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/main/apps/docs/content/docs/${page.path}

${page.data.description ?? ""}
        
${processed}`;
}
