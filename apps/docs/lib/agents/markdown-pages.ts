// Markdown versions of marketing pages for agents (/pricing.md, /mcp.md),
// built from the same data as the pages, so they can't say something else.
import {
  MCP_FAQS,
  MCP_INTRO,
  MCP_STEPS,
  MCP_TOOLS,
} from "@/app/[lang]/(home)/mcp/content";
import {
  GUARANTEE_NAME,
  GUARANTEE_PROMISES,
} from "@/components/sections/pricing/guarantee-block";
import {
  buildComparison,
  buildHighlights,
  buildPricingIntro,
  type CellValue,
  type PlanLimitsByPlan,
  type PricingOptions,
  priceRow,
} from "@/components/sections/pricing/plan-content";
import { ENTERPRISE_ADDS } from "@/lib/enterprise";
import {
  claudeCodeCommand,
  claudeConnectorUrl,
  cursorInstallUrl,
  mcpConfigSnippets,
  mcpServerUrl,
  vscodeInstallRedirectUrl,
} from "@/lib/mcp-clients";
import {
  EUR_PRICES,
  formatPrice,
  localPricesNote,
  MONEY_BACK_DAYS,
  PAID_PLANS,
  type PaidPlan,
  PLAN_NAMES,
  type Plan,
  PRICING,
} from "@/lib/pricing";
import { fillFacts } from "@/lib/product-facts";
import { mcpServerCardUrl } from "./hosts";

const PLANS: Plan[] = ["free", ...PAID_PLANS];

interface Faq {
  question: string;
  answer: unknown;
}

const cell = (value: CellValue) =>
  value === true
    ? "Yes"
    : value === false
      ? "No"
      : value.replaceAll("|", "\\|");

const faqSection = (faqs: Faq[]) =>
  faqs
    .filter(
      (faq): faq is { question: string; answer: string } =>
        typeof faq.answer === "string",
    )
    .map((faq) => `### ${faq.question}\n\n${fillFacts(faq.answer)}`)
    .join("\n\n");

export interface PricingMarkdownInput {
  origin: URL;
  limits: PlanLimitsByPlan;
  offered: PricingOptions;
  faqs: Faq[];
}

/** /pricing as Markdown: plans, every limit, the guarantee and the FAQ. */
export function pricingMarkdown({
  origin,
  limits,
  offered,
  faqs,
}: PricingMarkdownInput): string {
  const abs = (path: string) => new URL(path, origin).toString();
  const highlights = buildHighlights(limits, offered);
  const price = (plan: Plan) => {
    if (plan === "free") return formatPrice(0, "USD");
    const paid = PRICING[plan as PaidPlan];
    return `${formatPrice(paid.month.amounts.USD, "USD")} a month or ${formatPrice(paid.year.amounts.USD, "USD")} a year (${localPricesNote(plan as PaidPlan)})`;
  };

  const plans = PLANS.map(
    (plan) =>
      `### ${PLAN_NAMES[plan]}: ${price(plan)}\n\n${plan === "business" ? "Everything in Pro, plus:\n\n" : ""}${highlights[plan].map((line) => `- ${line}`).join("\n")}`,
  ).join("\n\n");

  const header = `| Feature | ${PLANS.map((plan) => PLAN_NAMES[plan]).join(" | ")} |\n| --- | ${PLANS.map(() => "---").join(" | ")} |`;
  const inr = priceRow("INR");
  const eur = priceRow("EUR");
  const table = buildComparison(limits, "USD", offered)
    .map((group) => {
      const rows =
        group.title === "Price"
          ? [
              ...group.rows,
              { ...inr, feature: "Price in India" },
              ...(EUR_PRICES
                ? [{ ...eur, feature: "Price in the EU and EEA" }]
                : []),
            ]
          : group.rows;
      return [
        `| **${group.title}** | ${PLANS.map(() => "").join(" | ")} |`,
        ...rows.map(
          (row) =>
            `| ${row.feature}${row.hint ? ` (${row.hint})` : ""} | ${PLANS.map((plan) => cell(row.values[plan])).join(" | ")} |`,
        ),
      ].join("\n");
    })
    .join("\n");

  return `${[
    "# QRdx pricing",
    `> ${buildPricingIntro(offered)} Customers in India are charged in rupees, ${EUR_PRICES ? "customers in the EU and EEA in euros, " : ""}everyone else in US dollars. The first payment for a paid plan comes with a ${MONEY_BACK_DAYS}-day money-back guarantee.`,
    `URL: ${abs("/pricing")}`,
    "## Plans",
    plans,
    "## Compare plans",
    `${header}\n${table}`,
    `## ${GUARANTEE_NAME}`,
    `${GUARANTEE_PROMISES.map((promise) => `- **${promise.title}.** ${promise.body}`).join("\n")}\n\nMore: ${abs("/guarantee")}`,
    "## FAQ",
    faqSection(faqs),
    "## More",
    [
      `- [Plans and limits](${abs("/docs/plans-and-limits")}): what happens at each limit`,
      `- [Enterprise](${abs("/enterprise")}): custom price, the Business plan under a contract. Adds: ${ENTERPRISE_ADDS.join("; ")}`,
      `- [Security](${abs("/security")}): how QRdx protects accounts and data`,
      `- [Help with billing](${abs("/docs/help")})`,
      `- [Site index for LLMs](${abs("/llms.txt")})`,
    ].join("\n"),
  ].join("\n\n")}\n`;
}

/** /mcp as Markdown: the endpoint, how to connect each app, tools and FAQ. */
export function mcpMarkdown(origin: URL): string {
  const abs = (path: string) => new URL(path, origin).toString();
  const url = mcpServerUrl(origin);
  const snippets = mcpConfigSnippets(url);
  const json = (code: string) => `\`\`\`json\n${code}\n\`\`\``;

  const connect = [
    `### Claude (claude.ai and Claude Desktop)\n\nOpen [Add custom connector with QRdx filled in](${claudeConnectorUrl(url)}), or go to Customize → Connectors → Add custom connector, name it QRdx and paste \`${url}\`. Leave the OAuth fields empty, click Add, then turn QRdx on from a chat's tools menu. Free plans can add one custom connector; on Team and Enterprise plans an owner adds it.`,
    `### Claude Code\n\n\`\`\`bash\n${claudeCodeCommand(url)}\n\`\`\``,
    `### Cursor\n\n[Add to Cursor](${cursorInstallUrl(url)}) (opens Cursor's install prompt), or add this to \`${snippets.cursor.file}\`:\n\n${json(snippets.cursor.code)}`,
    `### VS Code (GitHub Copilot)\n\n[Install in VS Code](${vscodeInstallRedirectUrl(url)}), or add this to \`${snippets.vscode.file}\`, then use Copilot Chat in agent mode:\n\n${json(snippets.vscode.code)}`,
    `### ChatGPT\n\nAt https://chatgpt.com/plugins, click + and choose Add custom MCP server. Name it QRdx, enter \`${url}\` as the URL, choose no authentication, accept the warning and create it. Then type @ in a new chat and pick QRdx. Your ChatGPT plan and workspace settings decide whether custom MCP servers are allowed.`,
    `### Devin Desktop (formerly Windsurf)\n\nAdd this to \`${snippets.windsurf.file}\`, then refresh the MCP servers:\n\n${json(snippets.windsurf.code)}`,
    `### Any other MCP app\n\nAdd a remote server with the URL \`${url}\` (Streamable HTTP, no authentication). Apps that only run local servers can bridge it with mcp-remote (needs Node.js):\n\n${json(snippets.bridge.code)}`,
  ].join("\n\n");

  return `${[
    "# QRdx MCP server",
    `> ${MCP_INTRO}`,
    [
      `- Endpoint: \`${url}\` (Streamable HTTP)`,
      "- No account or API key for designing, rendering and the community. Only save_template and save_barcode write (a theme or a barcode in an API key's workspace); the server keeps no other data.",
      `- Connect page: ${abs("/mcp")}`,
      `- Docs: ${abs("/docs/developers/mcp")}`,
      `- Server card: ${mcpServerCardUrl(origin)}`,
    ].join("\n"),
    "## How it works",
    MCP_STEPS.map(
      (step, index) => `${index + 1}. **${step.title}.** ${step.body}`,
    ).join("\n"),
    "## Connect your app",
    connect,
    "## Tools",
    MCP_TOOLS.map(
      (tool) =>
        `- \`${tool.name}\` (${tool.title}${tool.needsKey ? ", needs an API key" : ", no key"}): ${tool.description}`,
    ).join("\n"),
    "## FAQ",
    faqSection(MCP_FAQS),
  ].join("\n\n")}\n`;
}
