import type { NextRequest } from "next/server";
import { z } from "zod";
import { codeIdSchema, getCode } from "@/app/dashboard/codes/_lib/qr-codes";
import { handleError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { parseWithSchema } from "@/lib/request-guards";
import {
  getScanAnalytics,
  listScans,
  resolveScanRange,
  SCAN_RANGE_KEYS,
} from "@/lib/scans";
import { NO_STORE, resolveApiScope } from "../../_lib/api";

const querySchema = z.object({
  range: z.enum(SCAN_RANGE_KEYS as [string, ...string[]]).optional(),
  // Individual scans, newest first; 0 = aggregates only.
  limit: z.coerce.number().int().min(0).max(500).default(0),
  before: z.iso.datetime().optional(),
});

/**
 * Aggregated analytics for a range (clamped to the plan's retention), plus
 * optional individual scans paginated with `before` = the last `scannedAt`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await resolveApiScope(req, "read");
    const id = parseWithSchema(codeIdSchema, (await params).id);
    const query = parseWithSchema(
      querySchema,
      Object.fromEntries(req.nextUrl.searchParams),
    );

    const [code, plan] = await Promise.all([
      getCode(scope, id),
      getPlanForScope(scope),
    ]);
    const retentionDays = getPlanLimits(plan).analyticsRetentionDays;
    const { range, days } = resolveScanRange(query.range, retentionDays);
    const analytics = await getScanAnalytics(code.id, days);

    const events =
      query.limit > 0
        ? await listScans(code.id, {
            from: analytics.from,
            before: query.before ? new Date(query.before) : null,
            limit: query.limit,
          })
        : null;

    return Response.json(
      {
        data: {
          codeId: code.id,
          range,
          retentionDays,
          ...analytics,
          from: analytics.from.toISOString(),
          ...(events && {
            events: events.map((event) => ({
              ...event,
              scannedAt: event.scannedAt.toISOString(),
            })),
            nextBefore:
              events.length === query.limit
                ? (events.at(-1)?.scannedAt.toISOString() ?? null)
                : null,
          }),
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "GET /api/v1/codes/[id]/scans" });
  }
}
