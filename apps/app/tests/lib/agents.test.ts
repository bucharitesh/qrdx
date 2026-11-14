// Agent-facing surfaces (lib/agents): robots.txt rules, the llms.txt
// structure, the discovery documents (MCP Server Card, AI Catalog, RFC 9727
// API catalog) and the Markdown that docs and marketing pages turn into.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOLS } from "@/app/[lang]/(home)/mcp/content";
import { MCP_SERVER_INFO } from "@/app/api/mcp/tools";
import robots from "@/app/robots";
import { apiBaseUrl, imageApiUrl, isOfficialOrigin } from "@/lib/agents/hosts";
import { cleanLlmMarkdown } from "@/lib/agents/llm-markdown";
import {
  buildLlmsTxt,
  LLMS_SECTIONS,
  type LlmsTxtInput,
} from "@/lib/agents/llms-txt";
import { mcpMarkdown, pricingMarkdown } from "@/lib/agents/markdown-pages";
import { AI_CRAWLERS, DISALLOW } from "@/lib/agents/robots-rules";
import {
  aiCatalog,
  apiCatalog,
  jsonDocument,
  SERVER_CARD_SCHEMA,
  serverCard,
} from "@/lib/agents/well-known";
import { MCP_PUBLIC_URL } from "@/lib/mcp-clients";
import { PLAN_LIMITS } from "@/lib/plans";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import { QR_TYPES } from "@/lib/qr-types-content";

const LOCAL = new URL("http://localhost:3000");
const SELF_HOSTED = new URL("https://qr.example.com");
const selfHosted = { appUrl: "https://qr.example.com" };

/** Every Markdown link target in `text`. */
const linkTargets = (text: string) =>
  [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);

describe("robots.txt", () => {
  const { rules } = robots();
  const groups = Array.isArray(rules) ? rules : [rules];
  const byAgent = new Map(
    groups.flatMap((group) =>
      [group.userAgent].flat().map((agent) => [agent, group] as const),
    ),
  );

  it("welcomes the AI crawlers and assistants by name", () => {
    for (const agent of [
      "GPTBot",
      "OAI-SearchBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-User",
      "Claude-SearchBot",
      "PerplexityBot",
      "Perplexity-User",
      "Google-Extended",
      "Applebot-Extended",
      "CCBot",
    ]) {
      expect(AI_CRAWLERS).toContain(agent);
      expect(byAgent.get(agent)?.allow).toBe("/");
    }
  });

  it("keeps the app, API and machine paths out of every group", () => {
    expect(byAgent.has("*")).toBe(true);
    for (const group of groups) {
      expect(group.disallow).toEqual(DISALLOW);
    }
    for (const privatePath of [
      "/api/",
      "/dashboard",
      "/settings",
      "/admin",
      "/oauth",
      "/q/",
    ]) {
      expect(DISALLOW).toContain(privatePath);
    }
    // Hosted pages carry their own noindex, which a disallow would hide.
    expect(DISALLOW).not.toContain("/p/");
  });
});

const fixture = (overrides: Partial<LlmsTxtInput> = {}): LlmsTxtInput => ({
  origin: LOCAL,
  offered: {},
  showsPath: () => true,
  limits: PLAN_LIMITS,
  docs: [
    {
      title: "",
      pages: [{ title: "QRdx docs", url: "/docs", description: "Start" }],
    },
    {
      title: "Help",
      pages: [{ title: "Help center", url: "/docs/help" }],
    },
    {
      title: "Guides",
      pages: [{ title: "Custom domains", url: "/docs/custom-domains" }],
    },
  ],
  blog: [{ title: "A post", url: "/blog/a-post" }],
  customers: [{ title: "A customer story", url: "/customers/acme" }],
  compare: [{ title: "QRdx vs X", url: "/compare/x" }],
  legal: [{ title: "Privacy Policy", url: "/legal/privacy-policy" }],
  integrations: [{ title: "Slack", url: "/integrations/slack" }],
  plugins: [{ title: "Chrome", url: "/plugins/chrome" }],
  npm: {
    library: { name: "qrdx", repo: "0.0.47", published: "0.0.47" },
    cli: { name: "@qrdx/cli", repo: "0.0.5", published: "0.0.5" },
  },
  ...overrides,
});

describe("llms.txt", () => {
  const text = buildLlmsTxt(fixture());

  it("follows the llmstxt.org layout", () => {
    const lines = text.split("\n");
    expect(lines[0]).toBe("# QRdx");
    expect(lines[2]).toMatch(/^> QRdx \(qrdx\.dev\) is /);
    expect(text.match(/^# /gm)).toHaveLength(1);
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([...LLMS_SECTIONS]);
    // Sections hold link lists only.
    const body = text.slice(text.indexOf("\n## "));
    for (const line of body.split("\n")) {
      if (line && !line.startsWith("## ")) expect(line).toMatch(/^- \[/);
    }
  });

  it("links absolutely, to this site or QRdx's own hosts", () => {
    const allowed = [
      LOCAL.origin,
      "https://api.qrdx.dev/",
      "https://github.com/qrdxinc/qrdx",
    ];
    const targets = linkTargets(text);
    expect(targets.length).toBeGreaterThan(QR_TYPES.length);
    for (const target of targets) {
      expect(allowed.some((prefix) => target.startsWith(prefix))).toBe(true);
    }
    for (const path of [
      "/openapi.json",
      "/docs/developers/ai-agents",
      "/docs/developers/mcp",
      "/docs/developers/rest-api",
      "/docs/developers/image-api",
      "/docs/developers/cli",
      "/docs/getting-started",
      "/docs/developers/shadcn",
      "/.well-known/ai-catalog.json",
      "/pricing.md",
      "/legal/privacy-policy",
      "/docs/help",
      "/llms-full.txt",
      "/blog/a-post",
      "/customers",
      "/customers/acme",
    ]) {
      expect(targets).toContain(`${LOCAL.origin}${path}`);
    }
    expect(text).toContain(`\`${MCP_PUBLIC_URL}\``);
    expect(targets).toContain(
      imageApiUrl(LOCAL, { data: "https://qrdx.dev", format: "svg" }),
    );
  });

  it("takes product counts from the catalogues, never from the source", () => {
    expect(text).toContain(
      `${PRODUCT_FACTS.bodyPatterns} body patterns, ${PRODUCT_FACTS.eyeShapes} corner-eye shapes and ${PRODUCT_FACTS.eyeCentres} eye centers, ${PRODUCT_FACTS.frames} frames`,
    );
    expect(text).toContain(`${QR_TYPES.length} content types`);
    const source = readFileSync(
      path.resolve(import.meta.dirname, "../../lib/agents/llms-txt.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /\b\d+\s+(?:body patterns|corner-eye|eye cent(?:er|re)s|frames|content types|industries|placements|styled codes)/,
    );
  });

  it("states the free API, the MCP answer and the free plan as quotable facts", () => {
    expect(text).toContain(
      `at up to ${PRODUCT_FACTS.imageApiPerMinute} requests a minute per IP address`,
    );
    expect(text).toContain(
      `A free account adds ${PLAN_LIMITS.free.dynamicCodes} dynamic codes and ${PLAN_LIMITS.free.landingPages} hosted pages`,
    );
    expect(text).toContain("Can Claude or ChatGPT make a QR code that scans?");
    expect(text).toContain("- When to choose something else:");
  });

  it("leaves out what this deployment can't offer", () => {
    const limited = buildLlmsTxt(
      fixture({
        offered: { customDomains: false, aiArt: false, aiThemes: false },
        showsPath: (p) => !p.startsWith("/docs/custom-domains"),
      }),
    );
    expect(limited).not.toMatch(/custom domains/i);
    expect(limited).not.toContain("/ai/art");
    expect(limited).not.toContain(`${LOCAL.origin}/ai)`);
    expect(limited).not.toMatch(/AI art/);
  });

  it("puts help pages under Help center and the rest under Docs", () => {
    const docs = text.slice(text.indexOf("## Docs"), text.indexOf("## Help"));
    const help = text.slice(
      text.indexOf("## Help center"),
      text.indexOf("## Pricing"),
    );
    expect(docs).toContain("/docs/custom-domains");
    expect(docs).not.toContain("/docs/help");
    expect(help).toContain("/docs/help");
  });

  it("says when npm is behind the docs, and only then", () => {
    expect(text).not.toContain("isn't on npm yet");
    const behind = buildLlmsTxt(
      fixture({
        npm: {
          library: { name: "qrdx", repo: "0.0.47", published: "0.0.46" },
          cli: { name: "@qrdx/cli", repo: "0.0.5", published: null },
        },
      }),
    );
    expect(behind).toContain(
      "npm's latest is qrdx@0.0.46; these docs describe 0.0.47",
    );
    expect(behind).not.toContain("@qrdx/cli@");
  });
});

describe("discovery documents", () => {
  it("serves an MCP Server Card that matches the server", () => {
    const card = serverCard(LOCAL);
    expect(card.$schema).toBe(SERVER_CARD_SCHEMA);
    expect(card.name).toBe(`dev.qrdx/${MCP_SERVER_INFO.name}`);
    expect(card.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(card.version).toBe(MCP_SERVER_INFO.version);
    expect(card.description.length).toBeLessThanOrEqual(100);
    expect(card.remotes).toEqual([
      expect.objectContaining({ type: "streamable-http", url: MCP_PUBLIC_URL }),
    ]);
    expect(card.remotes?.[0].supportedProtocolVersions?.length).toBeGreaterThan(
      0,
    );
  });

  it("points a self-hosted instance at its own endpoints", () => {
    expect(isOfficialOrigin(SELF_HOSTED, selfHosted)).toBe(false);
    expect(apiBaseUrl(SELF_HOSTED, selfHosted)).toBe(
      "https://qr.example.com/api/v1",
    );
    const card = serverCard(SELF_HOSTED, selfHosted);
    expect(card.name).toBe("com.example.qr/qrdx");
    expect(card.remotes?.[0].url).toBe("https://qr.example.com/api/mcp");
    const catalog = aiCatalog(SELF_HOSTED, selfHosted);
    expect(catalog.entries[0]).toMatchObject({
      identifier: "urn:air:qr.example.com:mcp:qrdx",
      url: "https://qr.example.com/api/mcp/server-card",
    });
  });

  it("lists the REST API and the MCP server in the API catalog", () => {
    const { linkset } = apiCatalog(LOCAL);
    expect(linkset.map((entry) => entry.anchor)).toEqual([
      "https://api.qrdx.dev/v1",
      MCP_PUBLIC_URL,
    ]);
    expect(linkset[0]["service-desc"][0].href).toBe(
      "https://qrdx.dev/openapi.json",
    );
  });

  it("answers with CORS, caching and a working ETag", async () => {
    const first = jsonDocument(
      new Request("https://qrdx.dev/x"),
      { a: 1 },
      "application/json",
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("access-control-allow-origin")).toBe("*");
    expect(first.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(JSON.parse(await first.text())).toEqual({ a: 1 });
    const etag = first.headers.get("etag") ?? "";
    expect(etag).toMatch(/^".+"$/);
    const again = jsonDocument(
      new Request("https://qrdx.dev/x", { headers: { "If-None-Match": etag } }),
      { a: 1 },
      "application/json",
    );
    expect(again.status).toBe(304);
  });
});

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

describe("Markdown versions of marketing pages", () => {
  it("renders pricing from the plan data", () => {
    const text = pricingMarkdown({
      origin: LOCAL,
      limits: PLAN_LIMITS,
      offered: {},
      faqs: [{ question: "Q?", answer: "{facts.frames} frames." }],
    });
    expect(text).toMatch(/^# QRdx pricing\n/);
    for (const heading of ["### Free", "### Pro", "### Business"]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("| Feature | Free | Pro | Business |");
    expect(text).toContain(`${PRODUCT_FACTS.frames} frames.`);
  });

  it("renders the MCP page with every tool and install path", () => {
    const text = mcpMarkdown(LOCAL);
    expect(text).toContain(`\`${MCP_PUBLIC_URL}\``);
    expect(text).toContain("cursor://anysphere.cursor-deeplink/mcp/install");
    expect(text).toContain("claude mcp add --transport http qrdx");
    for (const tool of MCP_TOOLS) expect(text).toContain(`\`${tool.name}\``);
  });
});
