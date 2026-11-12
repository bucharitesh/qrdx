import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import { recordUsage } from "@/lib/analytics/usage";

// The MCP server's usage counts (usage_daily, lib/analytics/usage.ts): each
// tool call by tool name, failed calls, and each `initialize` as a stand-in
// for sessions (the server is stateless), by the client's coarse family.
// Never the arguments, the content or anything about the person.

type ToolCallback = (...args: unknown[]) => unknown;
type RegisterTool = (
  name: string,
  config: unknown,
  callback: ToolCallback,
) => unknown;

/** `server` with every tool registered on it counting its calls and failures. */
export function countToolCalls(server: McpServer): McpServer {
  const register = server.registerTool.bind(server) as RegisterTool;
  const counted: RegisterTool = (name, config, callback) =>
    register(name, config, async (...args: unknown[]) => {
      recordUsage("mcp", "tool_call", name);
      try {
        const result = await callback(...args);
        if ((result as { isError?: unknown } | null)?.isError === true) {
          recordUsage("mcp", "error", name);
        }
        return result;
      } catch (error) {
        recordUsage("mcp", "error", name);
        throw error;
      }
    });
  (server as unknown as { registerTool: RegisterTool }).registerTool = counted;
  return server;
}

/** Client families worth telling apart, by a word in the client's name. */
const CLIENT_FAMILIES: [RegExp, string][] = [
  [/claude/, "claude"],
  [/cursor/, "cursor"],
  [/windsurf|codeium/, "windsurf"],
  [/vs ?code|visual studio code|copilot/, "vscode"],
  [/chatgpt|openai/, "chatgpt"],
  [/gemini/, "gemini"],
  [/\bzed\b/, "zed"],
  [/cline/, "cline"],
  [/continue/, "continue"],
  [/goose/, "goose"],
  [/n8n/, "n8n"],
  [/raycast/, "raycast"],
  [/inspector/, "inspector"],
];

/**
 * The family of an MCP client from its self-reported name ("claude-ai",
 * "Cursor", "Visual Studio Code"): one of a fixed list, else "other".
 */
export function mcpClientFamily(name: unknown): string {
  if (typeof name !== "string") return "other";
  const lower = name.toLowerCase().slice(0, 100);
  return (
    CLIENT_FAMILIES.find(([pattern]) => pattern.test(lower))?.[1] ?? "other"
  );
}

/**
 * mcp-handler's onEvent: an `initialize` request counts as a session, by
 * client family.
 */
export function countMcpSessions(event: {
  type: string;
  method?: string;
  parameters?: unknown;
}): void {
  if (event.type !== "REQUEST_RECEIVED" || event.method !== "initialize") {
    return;
  }
  const params = (event.parameters as { params?: unknown } | null)?.params;
  const clientInfo = (params as { clientInfo?: { name?: unknown } } | null)
    ?.clientInfo;
  recordUsage("mcp", "session", mcpClientFamily(clientInfo?.name));
}
