// The Markdown the docs' .md, llms.mdx and llms-full.txt routes serve
// (lib/agents/llm-markdown.ts): components become plain Markdown, code stays
// as written, and <IfAvailable> content follows what the deployment offers.
import { describe, expect, it } from "vitest";
import { cleanLlmMarkdown } from "@/lib/agents/llm-markdown";

describe("Markdown for LLMs", () => {
  const source = [
    'Intro with [a link](/docs/teams) and `<QRCode value="x" />` inline.',
    "",
    '<ComponentPreview name="qr-code-demo" />',
    "",
    "<Cards>",
    "  <Card",
    "    icon={<Globe />}",
    '    href="/docs/files"',
    '    title="Files"',
    '    description="Upload PDFs."',
    "  />",
    '  <IfAvailable feature="customDomains">',
    '    <Card href="/docs/custom-domains" title="Domains" description="Own domain." />',
    "  </IfAvailable>",
    "</Cards>",
    "",
    '<Tabs items={["One", "Two"]}>',
    '  <Tab value="One">',
    "    ```bash",
    "    echo one",
    "    ```",
    "  </Tab>",
    "</Tabs>",
    "",
    '<InstallationTabs name="qr-code" />',
    "",
    'Text<IfAvailable feature="customDomains"> with domains</IfAvailable>.',
    "",
    "```tsx",
    '<Card title="kept" />',
    "```",
  ].join("\n");
  const shown = cleanLlmMarkdown(source, { origin: "https://qrdx.dev" });
  const hidden = cleanLlmMarkdown(source, {
    origin: "https://qrdx.dev",
    isShown: ({ feature }) => feature !== "customDomains",
  });

  it("turns components into plain Markdown", () => {
    expect(shown).not.toContain("ComponentPreview");
    expect(shown).not.toContain("<Cards>");
    expect(shown).toContain(
      "- [Files](https://qrdx.dev/docs/files): Upload PDFs.",
    );
    expect(shown).toContain("**One**\n\n```bash\necho one\n```");
    expect(shown).toContain(
      "```bash\nnpx shadcn@latest add https://qrdx.dev/r/qr-code.json\n```",
    );
    expect(shown).toContain("[a link](https://qrdx.dev/docs/teams)");
  });

  it("never touches code", () => {
    expect(shown).toContain('`<QRCode value="x" />`');
    expect(shown).toContain('```tsx\n<Card title="kept" />\n```');
  });

  it("keeps <IfAvailable> content only where the feature is offered", () => {
    expect(shown).toContain("Text with domains.");
    expect(shown).toContain("[Domains](https://qrdx.dev/docs/custom-domains)");
    expect(hidden).toContain("Text.");
    expect(hidden).not.toContain("domains");
    expect(hidden).not.toContain("Domains");
  });
});
