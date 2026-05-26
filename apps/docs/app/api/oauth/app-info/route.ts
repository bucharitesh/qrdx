import { database as db, oauthApp } from "@repo/database";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { oauthError } from "@/lib/oauth";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("client_id");

  if (!clientId) {
    return oauthError("invalid_request", "Missing client_id");
  }

  const [app] = await db
    .select({ name: oauthApp.name, description: oauthApp.description })
    .from(oauthApp)
    .where(and(eq(oauthApp.clientId, clientId), eq(oauthApp.isActive, true)))
    .limit(1);

  if (!app) {
    return oauthError("invalid_client", "Unknown client_id");
  }

  return Response.json({ name: app.name, description: app.description });
}
