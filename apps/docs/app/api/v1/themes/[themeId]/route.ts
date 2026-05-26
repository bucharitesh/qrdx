import { database as db, qrPreset } from "@repo/database";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { oauthError, requireAuth } from "@/lib/oauth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ themeId: string }> },
) {
  const auth = await requireAuth(req, "themes:read");
  if (auth.error) return auth.error;

  const { themeId } = await params;

  const [theme] = await db
    .select({
      id: qrPreset.id,
      name: qrPreset.name,
      style: qrPreset.style,
      createdAt: qrPreset.createdAt,
      updatedAt: qrPreset.updatedAt,
    })
    .from(qrPreset)
    .where(
      and(
        eq(qrPreset.id, themeId),
        eq(qrPreset.userId, auth.tokenData.userId),
      ),
    )
    .limit(1);

  if (!theme) {
    return oauthError("not_found", "Theme not found", 404);
  }

  return Response.json({ data: theme });
}
