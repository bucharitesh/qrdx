import { database as db, qrPreset } from "@repo/database";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requireApiToken } from "@/app/api/v1/codes/_lib/api";
import { oauthCompatibleError } from "@/lib/api-errors";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { HttpError } from "@/lib/error-response";

export const GET = withApiQuotaHeaders(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ themeId: string }> },
  ) => {
    const auth = await requireApiToken(req, "themes:read");
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
      return oauthCompatibleError(
        "not_found",
        new HttpError(404, "NOT_FOUND", "Theme not found."),
      );
    }

    return Response.json({ data: theme });
  },
);
