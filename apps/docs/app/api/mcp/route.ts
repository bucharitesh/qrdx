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

async function handler(req: Request): Promise<Response> {
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
