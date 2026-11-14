import { database as db, oauthToken } from "@repo/database";
import { eq, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { hashToken, oauthError } from "@/lib/oauth";

export async function POST(req: NextRequest) {
  const body = await req.formData().catch(() => null);
  if (!body) {
    return oauthError("invalid_request", "Request body must be form-encoded");
  }

  const token = body.get("token") as string | null;
  if (!token) {
    return oauthError("invalid_request", "Missing required parameter: token");
  }

  const tokenHash = hashToken(token);

  const [record] = await db
    .select({ id: oauthToken.id })
    .from(oauthToken)
    .where(
      or(
        eq(oauthToken.accessTokenHash, tokenHash),
        eq(oauthToken.refreshTokenHash, tokenHash),
      ),
    )
    .limit(1);

  if (record) {
    await db
      .update(oauthToken)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(oauthToken.id, record.id));
  }

  return new Response(null, { status: 200 });
}
