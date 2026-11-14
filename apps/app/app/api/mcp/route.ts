import {
  CANONICAL_ORIGIN,
  MCP_HOST,
  MCP_MAX_BATCH_MESSAGES,
} from "@repo/config";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { createMcpHandler } from "mcp-handler";
import { handleError } from "@/lib/error-response";
import {
  enforceRateLimits,
  getClientIp,
  readBodyBytes,
} from "@/lib/request-guards";
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO, registerQrTools } from "./tools";
import { countMcpSessions, countToolCalls } from "./usage";

// generate_ai_art waits for the art model (./art.ts), which gives up first.
export const maxDuration = 60;

// Public, stateless MCP server (Streamable HTTP). Tools only render QR codes
// and format payloads; nothing here reads or writes user data. Tool calls
// and sessions are counted by name and client family only (./usage.ts).
const mcpHandler = createMcpHandler(
  (server) => registerQrTools(countToolCalls(server)),
  {
    serverInfo: MCP_SERVER_INFO,
    instructions: MCP_INSTRUCTIONS,
    onEvent: countMcpSessions,
  },
);

// Per IP, counting each JSON-RPC message: a batch of five tool calls uses
// five of the minute's requests.
const ipRateLimiter = createRateLimiter({
  limiter: slidingWindow(120, "60 s"),
});

/** The MCP SDK's own cap on a request body; it answers 413 above it. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Accept, Authorization, Content-Type, Last-Event-ID, Mcp-Method, Mcp-Name, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Someone opened the server URL in a browser: send them to the connect page
 * instead of a JSON-RPC error. MCP clients never ask for text/html (and the
 * SSE stream asks for text/event-stream), so they're unaffected.
 */
function browserVisit(req: Request): Response | null {
  if (req.method !== "GET") return null;
  const accept = req.headers.get("accept") ?? "";
  if (!accept.includes("text/html") || accept.includes("text/event-stream")) {
    return null;
  }
  // On mcp.qrdx.dev, /mcp is this endpoint, so the page lives on qrdx.dev.
  const page =
    new URL(req.url).hostname === MCP_HOST
      ? `${CANONICAL_ORIGIN}/mcp`
      : new URL("/mcp", req.url).toString();
  return Response.redirect(page, 307);
}

/**
 * How many JSON-RPC messages a request carries: a batch's length, else 1 (one
 * message, a GET or DELETE, or a body the SDK refuses itself).
 */
async function messageCount(req: Request): Promise<number> {
  if (req.method !== "POST" || !req.body) return 1;
  const body = await readBodyBytes(req.clone(), MAX_BODY_BYTES);
  if (!body) return 1;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body).toString("utf8"));
    return Array.isArray(parsed) ? Math.max(1, parsed.length) : 1;
  } catch {
    return 1;
  }
}

const batchTooLarge = () =>
  Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32_600,
        message: `Invalid Request: Batch must not exceed ${MCP_MAX_BATCH_MESSAGES} messages`,
      },
      id: null,
    },
    { status: 400 },
  );

async function handler(req: Request): Promise<Response> {
  const visit = browserVisit(req);
  if (visit) return visit;
  try {
    const messages = await messageCount(req);
    await enforceRateLimits([
      {
        limiter: ipRateLimiter,
        key: `mcp:ip:${getClientIp(req)}`,
        rate: Math.min(messages, MCP_MAX_BATCH_MESSAGES),
      },
    ]);
    if (messages > MCP_MAX_BATCH_MESSAGES) return withCors(batchTooLarge());
    return withCors(await mcpHandler(req));
  } catch (error) {
    return withCors(handleError(error, { route: "/api/mcp" }));
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export { handler as DELETE, handler as GET, handler as POST };
