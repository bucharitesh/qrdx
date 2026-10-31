import type { NextRequest } from "next/server";
import { oauthError } from "@/lib/oauth";
import { loadAuthorizeApp } from "@/lib/oauth-apps/authorize";

// Public details of an active app, as the consent screen shows them.
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client_id");

  if (!clientId) {
    return oauthError("invalid_request", "Missing client_id");
  }

  const app = await loadAuthorizeApp(clientId);
  if (!app) {
    return oauthError("invalid_client", "Unknown client_id");
  }

  return Response.json({
    name: app.name,
    description: app.description,
    logo_url: app.logoUrl,
    website_url: app.websiteUrl,
    verified: app.trusted,
    built_by: app.builtBy,
  });
}
