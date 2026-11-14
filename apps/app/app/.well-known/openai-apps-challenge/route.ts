import { env } from "@/env";

// Domain verification for OpenAI's plugin directory: it fetches
// https://mcp.qrdx.dev/.well-known/openai-apps-challenge and expects the
// token from its submission portal as plain text, nothing else. The token
// lives in OPENAI_APPS_CHALLENGE; without it the path is a plain 404.
export function GET() {
  const token = env.OPENAI_APPS_CHALLENGE;
  if (!token) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(token, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
