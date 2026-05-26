import { database as db, user as userTable } from "@repo/database";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { oauthError, validateAccessToken } from "@/lib/oauth";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return oauthError(
      "invalid_token",
      "Missing or invalid Authorization header",
      401,
    );
  }

  const token = authHeader.slice(7);
  const tokenData = await validateAccessToken(token);

  if (!tokenData) {
    return oauthError("invalid_token", "Invalid or expired token", 401);
  }

  if (!tokenData.scopes.includes("profile:read")) {
    return oauthError("insufficient_scope", "Scope 'profile:read' required", 403);
  }

  const [profile] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
    })
    .from(userTable)
    .where(eq(userTable.id, tokenData.userId))
    .limit(1);

  if (!profile) {
    return oauthError("invalid_token", "User not found", 401);
  }

  return Response.json({
    sub: profile.id,
    name: profile.name,
    email: profile.email,
    picture: profile.image,
  });
}
