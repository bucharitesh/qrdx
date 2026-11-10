// The /mcp prompt gallery: each example prompt is copied, or sent to Claude
// as ?q=, followed by how to connect QRdx. They're joined by one blank line,
// with no indentation from the source carried into the text.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { McpPromptGalleryView } from "@/app/(app)/(home)/mcp/mcp-connect";

const SERVER = "https://mcp.qrdx.dev/mcp";
const PAGE = "https://qrdx.dev/mcp";

function claudePrompts(): string[] {
  const html = renderToStaticMarkup(
    <McpPromptGalleryView pageUrl={PAGE} tab="claude" url={SERVER} />,
  );
  const hrefs = [
    ...html.matchAll(/href="(https:\/\/claude\.ai\/new\?q=[^"]+)"/g),
  ]
    // Attribute values are HTML-escaped; a browser decodes them before use.
    .map((match) =>
      match[1]
        .replaceAll("&#x27;", "'")
        .replaceAll("&quot;", '"')
        .replaceAll("&amp;", "&"),
    )
    .map((href) => new URL(href).searchParams.get("q") ?? "");
  return hrefs;
}

describe("the /mcp prompt gallery", () => {
  it("sends each prompt and the connect hint separated by one blank line", () => {
    const prompts = claudePrompts();
    expect(prompts.length).toBeGreaterThan(0);
    for (const text of prompts) {
      const parts = text.split("\n\n");
      expect(parts, text).toHaveLength(2);
      expect(parts[1], text).toContain(SERVER);
      // No indentation or trailing spaces around the line breaks.
      expect(text, text).not.toMatch(/ \n|\n /);
      expect(text, text).not.toMatch(/ {2,}/);
    }
  });
});
