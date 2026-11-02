import { database as db, qrPreset } from "@repo/database";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requireApiToken } from "@/app/api/v1/codes/_lib/api";
import { withApiQuotaHeaders } from "@/lib/api-quota";

export const GET = withApiQuotaHeaders(async (req: NextRequest) => {
  const auth = await requireApiToken(req, "themes:read");
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
});
