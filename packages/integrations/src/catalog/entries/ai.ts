import type {
  CatalogCapability,
  CatalogSnippet,
  IntegrationCatalogEntry,
} from "../types";

/** Public MCP server; swapped for the deployment's origin when rendered. */
export const MCP_SERVER_URL = "https://mcp.qrdx.dev/mcp";

export const CLAUDE_CONNECTORS_URL =
  "https://claude.ai/customize/connectors?modal=add-custom-connector";
export const CHATGPT_CONNECTORS_URL =
  "https://chatgpt.com/#settings/Connectors";

const json = (value: unknown) => JSON.stringify(value, null, 2);

export const MCP_PROMPTS: { title: string; prompt: string }[] = [
  {
    title: "Café menu in black and gold",
    prompt:
      "Use QRdx to make a QR code for https://example.com/menu: black rounded modules on a cream (#FFF8E7) background with gold (#C9A227) corner eyes and the Arrow frame. Give me the PNG and SVG links.",
  },
  {
    title: "Wi-Fi card for guests",
    prompt:
      "Use QRdx to create a Wi-Fi QR code for the WPA network “Guest” with the password sunny-day-42, in dark green (#14532D), 1024 px, so I can print it for the front desk.",
  },
  {
    title: "Contact card in brand colors",
    prompt:
      "Use QRdx to make a contact (vCard) QR code for Ada Lovelace, Head of Research at Example Ltd, ada@example.com, +44 20 7946 0000, with rounded modules in #155DFC.",
  },
  {
    title: "Event check-in code",
    prompt:
      "Use QRdx to generate a QR code for https://example.com/checkin?event=summit with high error correction and a 1024 px PNG I can put on badges.",
  },
  {
    title: "Codes for a list of links",
    prompt:
      "Use QRdx to make one QR code for each of these links and give me a Markdown table with each link and its SVG image URL: https://example.com/a, https://example.com/b, https://example.com/c",
  },
  {
    title: "Map pin for your shop",
    prompt:
      "Use QRdx to create a QR code that opens the location 51.5007, -0.1246 in maps, in navy (#1E3A8A) with circle modules.",
  },
];

export const MCP_SNIPPETS = {
  claudeCode: {
    label: "Terminal",
    language: "bash",
    code: `claude mcp add --transport http qrdx ${MCP_SERVER_URL}`,
  },
  cursor: {
    label: "~/.cursor/mcp.json",
    language: "json",
    code: json({ mcpServers: { qrdx: { url: MCP_SERVER_URL } } }),
  },
  vscode: {
    label: ".vscode/mcp.json",
    language: "json",
    code: json({ servers: { qrdx: { type: "http", url: MCP_SERVER_URL } } }),
  },
  vscodeCli: {
    label: "Terminal",
    language: "bash",
    code: `code --add-mcp '${JSON.stringify({ name: "qrdx", type: "http", url: MCP_SERVER_URL })}'`,
  },
  windsurf: {
    label: "~/.codeium/windsurf/mcp_config.json",
    language: "json",
    code: json({ mcpServers: { qrdx: { serverUrl: MCP_SERVER_URL } } }),
  },
  geminiCli: {
    label: "Terminal",
    language: "bash",
    code: `gemini mcp add --transport http qrdx ${MCP_SERVER_URL}`,
  },
  geminiSettings: {
    label: "~/.gemini/settings.json",
    language: "json",
    code: json({ mcpServers: { qrdx: { httpUrl: MCP_SERVER_URL } } }),
  },
  codexCli: {
    label: "Terminal",
    language: "bash",
    code: `codex mcp add qrdx --url ${MCP_SERVER_URL}`,
  },
  codexToml: {
    label: "~/.codex/config.toml",
    language: "toml",
    code: `[mcp_servers.qrdx]\nurl = "${MCP_SERVER_URL}"`,
  },
  stdioBridge: {
    label: "Clients that only run local (stdio) servers",
    language: "json",
    code: json({
      mcpServers: {
        qrdx: { command: "npx", args: ["-y", "mcp-remote", MCP_SERVER_URL] },
      },
    }),
  },
} satisfies Record<string, CatalogSnippet>;

const MCP_CAPABILITIES: CatalogCapability[] = [
  {
    title: "Styled QR codes",
    description:
      "generate_qr_code returns a PNG plus SVG and PNG image links, with colors, module shapes, corner styles and frames.",
  },
  {
    title: "Ready-made payloads",
    description:
      "Wi-Fi, contact cards (vCard), email, SMS and map locations, formatted and escaped correctly.",
  },
  {
    title: "No account or key",
    description:
      "The server is public and stateless. It never reads or changes QRdx account data.",
  },
  {
    title: "Solid colors only",
    description:
      "Logos and gradients need the playground or the qrdx library. Up to 120 requests a minute.",
  },
];

const ASK_STEP = (where: string) => ({
  title: "Ask for a QR code",
  body: `${where} Try “Make a QR code for https://example.com in #155dfc with rounded modules.”`,
});

const base = {
  kind: "guide",
  categories: ["ai"],
  plan: "no-account",
  builtBy: "QRdx",
  docs: "/docs/developers/mcp",
  capabilities: MCP_CAPABILITIES,
} as const satisfies Partial<IntegrationCatalogEntry>;

export const ai: IntegrationCatalogEntry[] = [
  {
    ...base,
    slug: "claude",
    name: "Claude",
    tagline:
      "Add QRdx as a custom connector and ask Claude for styled QR codes and Wi-Fi or contact payloads.",
    description: [
      "QRdx runs a public MCP server. Add it to Claude as a custom connector and Claude can render QR codes in your brand colors, build Wi-Fi and contact payloads, and hand you SVG and PNG links for docs and emails.",
      "Connectors you add on claude.ai also work in the Claude desktop app.",
    ],
    logo: { type: "image", src: "/integrations/claude.svg" },
    website: "https://claude.ai",
    primaryAction: {
      type: "copy-open",
      label: "Connect QRdx",
      text: MCP_SERVER_URL,
      href: CLAUDE_CONNECTORS_URL,
      toast: "URL copied — paste it in Claude",
    },
    secondaryAction: {
      type: "link",
      label: "Open setup",
      href: "/mcp?tab=claude",
    },
    steps: [
      {
        title: "Click Connect QRdx",
        body: "The server URL is copied and Claude's “Add custom connector” screen opens in a new tab.",
      },
      {
        title: "Paste the URL and add the connector",
        body: "Name it QRdx, paste the URL as the remote MCP server URL and click Add. No sign-in is needed.",
        snippet: {
          label: "Server URL",
          language: "text",
          code: MCP_SERVER_URL,
        },
      },
      ASK_STEP("In a new chat, turn on QRdx in the tools menu."),
    ],
    keywords: ["anthropic", "mcp", "connector", "assistant", "chat", "desktop"],
    related: ["claude-code", "chatgpt", "cursor"],
  },
  {
    ...base,
    slug: "chatgpt",
    name: "ChatGPT",
    tagline:
      "Add the QRdx MCP server as an app in ChatGPT developer mode and generate QR codes in chat.",
    description: [
      "ChatGPT's developer mode can use remote MCP servers. Add QRdx with no authentication and ChatGPT can render styled QR codes and build Wi-Fi, contact, email, SMS and location payloads.",
      "Developer mode is available on the web for Plus, Pro, Business, Enterprise and Education accounts.",
    ],
    logo: { type: "image", src: "/integrations/chatgpt.svg" },
    website: "https://chatgpt.com",
    primaryAction: {
      type: "copy-open",
      label: "Connect QRdx",
      text: MCP_SERVER_URL,
      href: CHATGPT_CONNECTORS_URL,
      toast: "URL copied — paste it in ChatGPT",
    },
    secondaryAction: {
      type: "link",
      label: "Open setup",
      href: "/mcp?tab=chatgpt",
    },
    steps: [
      {
        title: "Turn on developer mode",
        body: "In ChatGPT, open Settings → Apps & Connectors → Advanced settings and switch on Developer mode.",
      },
      {
        title: "Click Connect QRdx, then create the app",
        body: "The URL is copied and ChatGPT's settings open. Click Create, name it QRdx, paste the URL, choose No authentication and create it.",
        snippet: {
          label: "MCP server URL",
          language: "text",
          code: MCP_SERVER_URL,
        },
      },
      ASK_STEP("In a chat, open + → Developer mode and select QRdx."),
    ],
    keywords: [
      "openai",
      "gpt",
      "mcp",
      "connector",
      "developer mode",
      "assistant",
    ],
    related: ["claude", "codex", "cursor"],
  },
  {
    ...base,
    slug: "claude-code",
    name: "Claude Code",
    tagline:
      "One command adds the QRdx MCP server, so Claude Code can drop QR codes into your README or app.",
    description: [
      "Add the QRdx server to Claude Code and ask it to generate a QR code while it works: it gets SVG and PNG image links to put in Markdown or HTML, or the SVG markup to save as a file.",
    ],
    logo: { type: "image", src: "/integrations/claude.svg" },
    website: "https://claude.com/product/claude-code",
    primaryAction: {
      type: "copy",
      label: "Copy command",
      text: MCP_SNIPPETS.claudeCode.code,
      toast: "Command copied — run it in your terminal",
    },
    secondaryAction: {
      type: "link",
      label: "Open setup",
      href: "/mcp?tab=claude-code",
    },
    steps: [
      {
        title: "Add the server",
        body: "Run this once in your terminal.",
        snippet: MCP_SNIPPETS.claudeCode,
      },
      {
        title: "Check the connection",
        body: "Run /mcp inside Claude Code; qrdx should be listed as connected.",
      },
      ASK_STEP("Ask in any session."),
    ],
    keywords: ["anthropic", "cli", "terminal", "agent", "mcp"],
    related: ["claude", "cursor", "codex"],
  },
  {
    ...base,
    slug: "cursor",
    name: "Cursor",
    tagline:
      "Install the QRdx MCP server in Cursor with one click and generate QR codes from the agent.",
    description: [
      "With QRdx installed, Cursor's agent can render QR codes for your app, docs or README and write the SVG to a file, without leaving the editor.",
    ],
    logo: { type: "image", src: "/integrations/cursor.svg" },
    website: "https://cursor.com",
    primaryAction: {
      type: "mcp-install",
      label: "Add to Cursor",
      client: "cursor",
    },
    secondaryAction: {
      type: "link",
      label: "Open setup",
      href: "/mcp?tab=cursor",
    },
    steps: [
      {
        title: "Click Add to Cursor",
        body: "Cursor opens and asks to install the qrdx server. Confirm with Install.",
      },
      {
        title: "Or add it by hand",
        body: "Put this in ~/.cursor/mcp.json (all projects) or .cursor/mcp.json (one project).",
        snippet: MCP_SNIPPETS.cursor,
      },
      ASK_STEP("Ask in Agent chat."),
    ],
    keywords: ["editor", "ide", "agent", "mcp"],
    related: ["vscode", "windsurf", "claude-code"],
  },
  {
    ...base,
    slug: "vscode",
    name: "VS Code",
    tagline:
      "Install the QRdx MCP server in VS Code and use it from Copilot agent mode.",
    description: [
      "VS Code can install MCP servers from a link. Add QRdx and Copilot's agent mode can generate QR codes and payloads while it edits your project.",
    ],
    logo: { type: "image", src: "/integrations/vscode.svg" },
    website: "https://code.visualstudio.com",
    primaryAction: {
      type: "mcp-install",
      label: "Install in VS Code",
      client: "vscode",
    },
    secondaryAction: {
      type: "link",
      label: "Open setup",
      href: "/mcp?tab=vscode",
    },
    steps: [
      {
        title: "Click Install in VS Code",
        body: "VS Code opens and asks to install the qrdx server.",
      },
      {
        title: "Or add it from the terminal or mcp.json",
        body: "Run the command, or put the server in .vscode/mcp.json.",
        snippet: MCP_SNIPPETS.vscodeCli,
      },
      ASK_STEP("Ask in Copilot Chat in agent mode."),
    ],
    keywords: [
      "visual studio code",
      "copilot",
      "editor",
      "ide",
      "mcp",
      "github",
    ],
    related: ["cursor", "windsurf", "claude-code"],
  },
  {
    ...base,
    slug: "windsurf",
    name: "Windsurf",
    tagline:
      "Add the QRdx MCP server to Windsurf's Cascade with a three-line config.",
    description: [
      "Add QRdx to Windsurf's MCP config and Cascade can render QR codes and payloads for your project.",
    ],
    logo: { type: "image", src: "/integrations/windsurf.svg" },
    website: "https://windsurf.com",
    primaryAction: {
      type: "copy",
      label: "Copy config",
      text: MCP_SNIPPETS.windsurf.code,
      toast: "Config copied — paste it into mcp_config.json",
    },
    secondaryAction: {
      type: "link",
      label: "Open setup",
      href: "/mcp?tab=other",
    },
    steps: [
      {
        title: "Open Windsurf's MCP config",
        body: "Edit ~/.codeium/windsurf/mcp_config.json and add the server.",
        snippet: MCP_SNIPPETS.windsurf,
      },
      {
        title: "Refresh the servers",
        body: "Refresh MCP servers in Cascade, or restart Windsurf.",
      },
      ASK_STEP("Ask Cascade."),
    ],
    keywords: ["codeium", "cascade", "editor", "ide", "mcp"],
    related: ["cursor", "vscode", "gemini-cli"],
  },
  {
    ...base,
    slug: "gemini-cli",
    name: "Gemini CLI",
    tagline:
      "Add the QRdx MCP server to Gemini CLI with one command and make QR codes from the terminal.",
    description: [
      "Gemini CLI connects to remote MCP servers over HTTP. Add QRdx and ask Gemini for QR codes, Wi-Fi cards or contact payloads in any session.",
    ],
    logo: { type: "image", src: "/integrations/gemini.svg" },
    website: "https://github.com/google-gemini/gemini-cli",
    primaryAction: {
      type: "copy",
      label: "Copy command",
      text: MCP_SNIPPETS.geminiCli.code,
      toast: "Command copied — run it in your terminal",
    },
    secondaryAction: {
      type: "link",
      label: "Open setup",
      href: "/mcp?tab=other",
    },
    steps: [
      {
        title: "Add the server",
        body: "Run the command (add -s user to make it available in every project).",
        snippet: MCP_SNIPPETS.geminiCli,
      },
      {
        title: "Or edit settings.json",
        body: "Use httpUrl for the Streamable HTTP transport.",
        snippet: MCP_SNIPPETS.geminiSettings,
      },
      ASK_STEP("Run /mcp to check it, then ask."),
    ],
    keywords: ["google", "gemini", "terminal", "cli", "mcp"],
    related: ["codex", "claude-code", "windsurf"],
  },
  {
    ...base,
    slug: "codex",
    name: "Codex",
    tagline:
      "Add the QRdx MCP server to OpenAI's Codex with one command and generate QR codes while it codes.",
    description: [
      "Codex reads MCP servers from ~/.codex/config.toml. Add QRdx and Codex can render QR codes and payloads while it works on your code.",
    ],
    logo: { type: "image", src: "/integrations/codex.svg" },
    website: "https://openai.com/codex/",
    primaryAction: {
      type: "copy",
      label: "Copy command",
      text: MCP_SNIPPETS.codexCli.code,
      toast: "Command copied — run it in your terminal",
    },
    secondaryAction: {
      type: "link",
      label: "Open setup",
      href: "/mcp?tab=other",
    },
    steps: [
      {
        title: "Add the server",
        body: "Run the command once.",
        snippet: MCP_SNIPPETS.codexCli,
      },
      {
        title: "Or edit config.toml",
        body: "The url key makes it a Streamable HTTP server.",
        snippet: MCP_SNIPPETS.codexToml,
      },
      ASK_STEP("Ask in Codex."),
    ],
    keywords: ["openai", "terminal", "cli", "agent", "mcp"],
    related: ["chatgpt", "claude-code", "gemini-cli"],
  },
];
