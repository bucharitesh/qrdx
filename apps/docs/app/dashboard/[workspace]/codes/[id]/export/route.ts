import type { NextRequest } from "next/server";
import { getCode } from "@/app/dashboard/codes/_lib/qr-codes";
import { handleError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import {
  listScans,
  rangeStart,
  resolveScanRange,
  scansToCsv,
  withoutPreciseLocation,
} from "@/lib/scans";
import { getActiveScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 50_000;

/** CSV of the code's scans in the selected range (newest first). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await getActiveScope(request.headers);
    const { id } = await params;
    const [code, plan] = await Promise.all([
      getCode(scope, id),
      getPlanForScope(scope),
    ]);
    const { range, days } = resolveScanRange(
      request.nextUrl.searchParams.get("range"),
      getPlanLimits(plan).analyticsRetentionDays,
    );
    // ── Precise location (lib/scan-location) ──
    const limits = getPlanLimits(plan);
    const scans = (
      await listScans(code.id, {
        from: rangeStart(days),
        limit: MAX_EXPORT_ROWS,
      })
    ).map((scan) =>
      // Precise location columns stay empty on plans without it.
      limits.preciseLocation ? scan : withoutPreciseLocation(scan),
    );

    return new Response(scansToCsv(scans), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="qrdx-${code.slug}-scans-${range}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleError(error, { route: "dashboard/codes/export" });
  }
}
