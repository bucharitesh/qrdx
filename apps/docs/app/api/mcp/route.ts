import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { createMcpHandler } from "mcp-handler";
import { handleError } from "@/lib/error-response";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO, registerQrTools } from "./tools";

// Public, stateless MCP server (Streamable HTTP). Tools only render QR codes
// and format payloads; nothing here reads or writes user data.
const mcpHandler = createMcpHandler(registerQrTools, {
  serverInfo: MCP_SERVER_INFO,
  instructions: MCP_INSTRUCTIONS,
});

const ipRateLimiter = createRateLimiter({
  limiter: slidingWindow(120, "60 s"),
});

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
    new URL(req.url).hostname === "mcp.qrdx.dev"
      ? "https://qrdx.dev/mcp"
      : new URL("/mcp", req.url).toString();
  return Response.redirect(page, 307);
}

async function handler(req: Request): Promise<Response> {
  const visit = browserVisit(req);
  if (visit) return visit;
  try {
    await enforceRateLimits([
      { limiter: ipRateLimiter, key: `mcp:ip:${getClientIp(req)}` },
    ]);
    return withCors(await mcpHandler(req));
  } catch (error) {
    return withCors(handleError(error, { route: "/api/mcp" }));
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export { handler as DELETE, handler as GET, handler as POST };
