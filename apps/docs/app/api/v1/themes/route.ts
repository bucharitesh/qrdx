import { database as db, qrPreset } from "@repo/database";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/oauth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, "themes:read");
  if (auth.error) return auth.error;

  const themes = await db
    .select({
      id: qrPreset.id,
      name: qrPreset.name,
      style: qrPreset.style,
      createdAt: qrPreset.createdAt,
      updatedAt: qrPreset.updatedAt,
    })
    .from(qrPreset)
    .where(eq(qrPreset.userId, auth.tokenData.userId));

  return Response.json({ data: themes });
}
