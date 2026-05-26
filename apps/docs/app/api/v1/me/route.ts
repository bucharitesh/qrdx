import { database as db, user as userTable } from "@repo/database";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { oauthError, requireAuth } from "@/lib/oauth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, "profile:read");
  if (auth.error) return auth.error;

  const [profile] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
    })
    .from(userTable)
    .where(eq(userTable.id, auth.tokenData.userId))
    .limit(1);

  if (!profile) {
    return oauthError("invalid_token", "User not found", 401);
  }

  return Response.json({ data: profile });
}
