import {
  discoveryPreflight,
  jsonDocument,
  SERVER_CARD_TYPE,
  serverCard,
} from "@/lib/agents/well-known";
import { baseUrl } from "@/lib/metadata";

// The MCP Server Card (SEP-2127) at <streamable-http-url>/server-card:
// mcp.qrdx.dev/mcp/server-card is rewritten here (next.config.ts), and a
// self-hosted instance serves it at /api/mcp/server-card.
export function GET(request: Request) {
  return jsonDocument(request, serverCard(baseUrl), SERVER_CARD_TYPE);
}

export const OPTIONS = discoveryPreflight;
