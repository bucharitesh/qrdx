/**
 * Links and config snippets for connecting AI apps to the QRdx MCP server
 * (app/api/mcp: public, Streamable HTTP, no auth). Shared by /mcp and the
 * integrations pages; keep the exports stable.
 */

export const MCP_SERVER_NAME = "qrdx";
export const MCP_PATH = "/api/mcp";

/** The hosted service's public endpoint (mcp.qrdx.dev/mcp → /api/mcp, see next.config.ts). */
export const MCP_PUBLIC_URL = "https://mcp.qrdx.dev/mcp";

const HOSTED_HOSTS = new Set(["qrdx.dev", "www.qrdx.dev", "mcp.qrdx.dev"]);

/**
 * Absolute MCP endpoint for an origin: MCP_PUBLIC_URL on qrdx.dev, otherwise
 * "<origin>/api/mcp" (local dev, previews and self-hosted instances).
 */
export function mcpServerUrl(origin: string | URL): string {
  const url = new URL(MCP_PATH, origin);
  return HOSTED_HOSTS.has(url.hostname) ? MCP_PUBLIC_URL : url.toString();
}

/** The clients shown as tabs on /mcp. */
export const MCP_CLIENT_IDS = [
  "claude",
  "chatgpt",
  "claude-code",
  "cursor",
  "vscode",
  "windsurf",
] as const;

export type McpClientId = (typeof MCP_CLIENT_IDS)[number];

export const MCP_CLIENT_NAMES: Record<McpClientId, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  "claude-code": "Claude Code",
  cursor: "Cursor",
  vscode: "VS Code",
  windsurf: "Windsurf",
};

/** Logo files in /public. */
export const MCP_CLIENT_LOGOS: Record<McpClientId, string> = {
  claude: "/integrations/claude.svg",
  chatgpt: "/integrations/chatgpt.svg",
  "claude-code": "/integrations/claude.svg",
  cursor: "/integrations/cursor.svg",
  vscode: "/integrations/vscode.svg",
  windsurf: "/integrations/windsurf.svg",
};

/** White versions of the black marks, for dark mode. */
export const MCP_CLIENT_LOGOS_DARK: Partial<Record<McpClientId, string>> = {
  chatgpt: "/mcp/chatgpt-white.svg",
  cursor: "/mcp/cursor-white.svg",
  windsurf: "/mcp/windsurf-white.svg",
};

/** Claude's "Add custom connector" dialog (Customize → Connectors). */
export const CLAUDE_CONNECTORS_URL =
  "https://claude.ai/customize/connectors?modal=add-custom-connector";

/** Claude's add-connector dialog with the name and server URL already filled in. */
export function claudeConnectorUrl(serverUrl: string): string {
  const url = new URL(CLAUDE_CONNECTORS_URL);
  url.searchParams.set("connectorName", "QRdx");
  url.searchParams.set("connectorUrl", serverUrl);
  return url.toString();
}

/** ChatGPT settings, Apps & Connectors (custom connectors need developer mode). */
export const CHATGPT_CONNECTORS_URL =
  "https://chatgpt.com/#settings/Connectors";

/** New Claude chat with the prompt filled in. */
export function claudeChatUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/** New ChatGPT chat with the prompt filled in. */
export function chatgptChatUrl(prompt: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

/** `claude mcp add` command for Claude Code. */
export function claudeCodeCommand(url: string): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}`;
}

const toBase64 = (value: string) =>
  typeof btoa === "function"
    ? btoa(value)
    : Buffer.from(value, "utf8").toString("base64");

/** Cursor install deeplink: base64 of the server's mcp.json entry. */
export function cursorInstallUrl(url: string): string {
  const config = toBase64(JSON.stringify({ url }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${encodeURIComponent(config)}`;
}

/** VS Code URL handler that opens the MCP install page in the editor. */
export function vscodeInstallUrl(url: string): string {
  return `vscode:mcp/install?${encodeURIComponent(
    JSON.stringify({ name: MCP_SERVER_NAME, type: "http", url }),
  )}`;
}

/**
 * https link that redirects to VS Code's install page (works from any
 * browser; add `&quality=insiders` for VS Code Insiders).
 */
export function vscodeInstallRedirectUrl(url: string): string {
  return `https://insiders.vscode.dev/redirect/mcp/install?name=${MCP_SERVER_NAME}&config=${encodeURIComponent(
    JSON.stringify({ type: "http", url }),
  )}`;
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

export interface McpConfigSnippet {
  id: string;
  name: string;
  /** Where the snippet goes. */
  file: string;
  language: "json" | "toml" | "yaml" | "shell";
  code: string;
}

/** Copy-paste config for apps without a one-click install. */
export function mcpConfigSnippets(
  url: string,
): Record<string, McpConfigSnippet> {
  return {
    cursor: {
      id: "cursor",
      name: "Cursor",
      file: "~/.cursor/mcp.json",
      language: "json",
      code: json({ mcpServers: { [MCP_SERVER_NAME]: { url } } }),
    },
    vscode: {
      id: "vscode",
      name: "VS Code",
      file: ".vscode/mcp.json",
      language: "json",
      code: json({ servers: { [MCP_SERVER_NAME]: { type: "http", url } } }),
    },
    windsurf: {
      id: "windsurf",
      name: "Windsurf",
      file: "~/.codeium/windsurf/mcp_config.json",
      language: "json",
      code: json({ mcpServers: { [MCP_SERVER_NAME]: { serverUrl: url } } }),
    },
    gemini: {
      id: "gemini",
      name: "Gemini CLI",
      file: "~/.gemini/settings.json",
      language: "json",
      code: json({ mcpServers: { [MCP_SERVER_NAME]: { httpUrl: url } } }),
    },
    codex: {
      id: "codex",
      name: "Codex",
      file: "~/.codex/config.toml",
      language: "toml",
      code: `[mcp_servers.${MCP_SERVER_NAME}]\nurl = "${url}"`,
    },
    bridge: {
      id: "bridge",
      name: "Any app",
      file: "mcp.json",
      language: "json",
      code: json({
        mcpServers: {
          [MCP_SERVER_NAME]: {
            command: "npx",
            args: ["-y", "mcp-remote", url],
          },
        },
      }),
    },
  };
}

/** Goose desktop deep link for a remote (Streamable HTTP) extension. */
export function gooseInstallUrl(url: string): string {
  const params = new URLSearchParams({
    url,
    type: "streamable_http",
    id: MCP_SERVER_NAME,
    name: "QRdx",
    description: "Styled QR codes and QR payloads",
  });
  return `goose://extension?${params.toString().replace(/\+/g, "%20")}`;
}

/** LM Studio deep link: base64 of the server's mcp.json entry. */
export function lmStudioInstallUrl(url: string): string {
  const config = toBase64(JSON.stringify({ url }));
  return `lmstudio://add_mcp?name=${MCP_SERVER_NAME}&config=${encodeURIComponent(config)}`;
}

/** Ids of the clients in the "Connect another client" picker. */
export const MCP_MORE_CLIENT_IDS = [
  "zed",
  "cline",
  "continue",
  "gemini",
  "codex",
  "goose",
  "lmstudio",
  "raycast",
  "warp",
  "jetbrains",
  "perplexity",
  "lechat",
  "copilot-studio",
  "any",
] as const;

export type McpMoreClientId = (typeof MCP_MORE_CLIENT_IDS)[number];

export interface McpMoreClient {
  id: McpMoreClientId;
  name: string;
  /** One line for the picker card. */
  hint: string;
  logo?: string;
  logoDark?: string;
  /** One-click install link, when the client has one. */
  install?: { href: string; label: string };
  snippet?: McpConfigSnippet;
  steps: string[];
}

/** More MCP apps for the "Connect another client" picker on /mcp. */
export function mcpMoreClients(url: string): McpMoreClient[] {
  const s = mcpConfigSnippets(url);
  const bridge = (file: string): McpConfigSnippet => ({
    ...s.bridge,
    file,
  });

  return [
    {
      id: "zed",
      name: "Zed",
      hint: "Remote server in settings.json",
      logo: "/mcp/zed.svg",
      logoDark: "/mcp/zed-white.svg",
      snippet: {
        id: "zed",
        name: "Zed",
        file: "settings.json",
        language: "json",
        code: json({ context_servers: { [MCP_SERVER_NAME]: { url } } }),
      },
      steps: [
        "Open Zed's settings (zed: open settings) and add the snippet, or use Settings → AI → MCP Servers → Add Server → Add Remote Server.",
        "Zed connects to the server. No sign-in is needed, so you can skip any authentication prompt.",
        "Ask the agent panel for a QR code.",
      ],
    },
    {
      id: "cline",
      name: "Cline",
      hint: "Streamable HTTP in MCP settings",
      logo: "/mcp/cline.svg",
      logoDark: "/mcp/cline-white.svg",
      snippet: {
        id: "cline",
        name: "Cline",
        file: "cline_mcp_settings.json",
        language: "json",
        code: json({
          mcpServers: {
            [MCP_SERVER_NAME]: {
              type: "streamableHttp",
              url,
              disabled: false,
            },
          },
        }),
      },
      steps: [
        "In Cline, open MCP Servers → Configure and edit cline_mcp_settings.json.",
        'Add the snippet. Keep "type": "streamableHttp"; without it Cline uses the older SSE transport.',
        "Save, check qrdx shows as connected, then ask for a QR code.",
      ],
    },
    {
      id: "continue",
      name: "Continue",
      hint: "mcpServers in config.yaml",
      snippet: {
        id: "continue",
        name: "Continue",
        file: "config.yaml",
        language: "yaml",
        code: `mcpServers:\n  - name: QRdx\n    type: streamable-http\n    url: ${url}`,
      },
      steps: [
        "Open Continue's config.yaml.",
        "Add the snippet under mcpServers.",
        "Use agent mode and ask for a QR code.",
      ],
    },
    {
      id: "gemini",
      name: "Gemini CLI",
      hint: "One command or settings.json",
      logo: "/integrations/gemini.svg",
      snippet: {
        id: "gemini-cli",
        name: "Gemini CLI",
        file: "Terminal",
        language: "shell",
        code: `gemini mcp add --transport http ${MCP_SERVER_NAME} ${url}`,
      },
      steps: [
        "Run the command. Add -s user to make it available in every project.",
        "Or add the httpUrl entry to ~/.gemini/settings.json yourself.",
        "Start gemini, run /mcp to check qrdx, then ask for a QR code.",
      ],
    },
    {
      id: "codex",
      name: "OpenAI Codex CLI",
      hint: "url in ~/.codex/config.toml",
      logo: "/integrations/codex.svg",
      logoDark: "/mcp/codex-white.svg",
      snippet: s.codex,
      steps: [
        "Open ~/.codex/config.toml (or .codex/config.toml in a trusted project).",
        "Add the snippet.",
        "Start codex, run /mcp to check qrdx, then ask for a QR code.",
      ],
    },
    {
      id: "goose",
      name: "Goose",
      hint: "One-click install link",
      install: { href: gooseInstallUrl(url), label: "Add to Goose" },
      steps: [
        "Click Add to Goose and allow the browser to open Goose Desktop.",
        "Confirm the QRdx extension.",
        "Ask Goose for a QR code.",
      ],
    },
    {
      id: "lmstudio",
      name: "LM Studio",
      hint: "One-click install link",
      logo: "/mcp/lmstudio.svg",
      logoDark: "/mcp/lmstudio-white.svg",
      install: { href: lmStudioInstallUrl(url), label: "Add to LM Studio" },
      snippet: {
        id: "lmstudio",
        name: "LM Studio",
        file: "mcp.json",
        language: "json",
        code: json({ mcpServers: { [MCP_SERVER_NAME]: { url } } }),
      },
      steps: [
        "Click Add to LM Studio and confirm the install, or add the snippet to mcp.json from the Program tab.",
        "Turn the qrdx tools on in a chat.",
        "Ask for a QR code with a model that supports tool calls.",
      ],
    },
    {
      id: "raycast",
      name: "Raycast",
      hint: "Install Server command",
      logo: "/mcp/raycast.svg",
      snippet: bridge("Raycast: Install Server"),
      steps: [
        "Open Raycast and run the Install Server command from the MCP extension.",
        "Paste the snippet. It runs the server through the mcp-remote bridge (needs Node.js).",
        "Mention @qrdx in Raycast AI and ask for a QR code.",
      ],
    },
    {
      id: "warp",
      name: "Warp",
      hint: "URL server in MCP servers",
      logo: "/mcp/warp.svg",
      snippet: {
        id: "warp",
        name: "Warp",
        file: "~/.warp/.mcp.json",
        language: "json",
        code: json({ mcpServers: { [MCP_SERVER_NAME]: { url } } }),
      },
      steps: [
        "Open Settings → Agents → MCP servers and click Add, or edit ~/.warp/.mcp.json.",
        "Paste the snippet and save.",
        "Ask Warp's agent for a QR code.",
      ],
    },
    {
      id: "jetbrains",
      name: "JetBrains IDEs",
      hint: "AI Assistant → Model Context Protocol",
      logo: "/mcp/jetbrains.svg",
      logoDark: "/mcp/jetbrains-white.svg",
      snippet: {
        id: "jetbrains",
        name: "JetBrains AI Assistant",
        file: "New MCP Server (JSON)",
        language: "json",
        code: json({ mcpServers: { [MCP_SERVER_NAME]: { url } } }),
      },
      steps: [
        "Open Settings → Tools → AI Assistant → Model Context Protocol (MCP) and add a server.",
        "Paste the JSON and choose global or project level.",
        "Ask AI Assistant for a QR code.",
      ],
    },
    {
      id: "perplexity",
      name: "Perplexity (Mac)",
      hint: "Local connector via mcp-remote",
      logo: "/mcp/perplexity.svg",
      snippet: bridge("Perplexity: custom connector"),
      steps: [
        "In Perplexity for Mac, open Settings → Connectors and add a custom connector.",
        "Use the command from the snippet (npx -y mcp-remote with the server URL). It needs Node.js.",
        "Turn the connector on and ask for a QR code.",
      ],
    },
    {
      id: "lechat",
      name: "Le Chat (Mistral)",
      hint: "Custom MCP connector",
      logo: "/mcp/mistral.svg",
      steps: [
        "In Le Chat, open Connectors, click Add Connector and choose Custom MCP Connector. An admin may need to do this.",
        `Name it qrdx and paste the server URL: ${url}`,
        "Click Connect (no sign-in needed), then ask for a QR code.",
      ],
    },
    {
      id: "copilot-studio",
      name: "Copilot Studio",
      hint: "Microsoft: add an MCP tool",
      steps: [
        "In your agent, open Tools → Add a tool → New tool → Model Context Protocol.",
        `Enter the server URL ${url} and choose no authentication.`,
        "Create the tool, add it to the agent and ask for a QR code.",
      ],
    },
    {
      id: "any",
      name: "Any MCP client",
      hint: "Remote URL (HTTP) or mcp-remote",
      snippet: s.bridge,
      steps: [
        `Add a remote MCP server with the URL ${url} (Streamable HTTP, no authentication).`,
        "Apps that only run local servers can use the snippet: it bridges the URL with mcp-remote (needs Node.js).",
        "Restart the app's MCP servers and ask for a QR code.",
      ],
    },
  ];
}
