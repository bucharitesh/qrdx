import "server-only";

import { requireAuditLogAccess } from "@/ee/audit-log/access";
import { AUDIT_CATEGORY_LABELS } from "@/ee/audit-log/catalogue";
import {
  AUDIT_CSV_HEADERS,
  auditCsvFilename,
  auditCsvLine,
  csvLine,
} from "@/ee/audit-log/csv";
import { parseAuditFilter } from "@/ee/audit-log/filter";
import { AUDIT_EXPORT_MAX_ROWS, auditExportRows } from "@/ee/audit-log/queries";
import { recordAuditEvent, userLabel } from "@/ee/audit-log/record";
import { handleError } from "@/lib/error-response";
import { logError } from "@/lib/log-error";
import { getActiveWorkspace } from "@/lib/scope";

// GET /dashboard/<slug>/settings/audit-log/export?actor=&category=&from=&to=
// The current filter as CSV, newest first, streamed in batches of 1,000 and
// capped at AUDIT_EXPORT_MAX_ROWS (the page says so). The export itself is
// recorded, with the filter used.

export async function exportAuditLog(request: Request): Promise<Response> {
  try {
    const { scope, workspace } = await getActiveWorkspace(
      new Headers(request.headers),
    );
    await requireAuditLogAccess(scope);
    const filter = parseAuditFilter(new URL(request.url).searchParams);
    const now = new Date();

    // The filter used, readable: who by name, the category's label.
    const who = filter.actor
      ? ((await userLabel(filter.actor).catch(() => null)) ?? filter.actor)
      : null;
    recordAuditEvent(scope, {
      action: "audit_log.exported",
      metadata: Object.fromEntries(
        Object.entries({
          who,
          category: filter.category
            ? AUDIT_CATEGORY_LABELS[filter.category]
            : null,
          from: filter.from,
          to: filter.to,
        }).filter(([, value]) => value),
      ),
    });

    const encoder = new TextEncoder();
    const rows = auditExportRows(
      scope.organizationId,
      filter,
      AUDIT_EXPORT_MAX_ROWS,
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // BOM so Excel reads names in any language as UTF-8.
        controller.enqueue(encoder.encode(`﻿${csvLine(AUDIT_CSV_HEADERS)}`));
      },
      async pull(controller) {
        try {
          const next = await rows.next();
          if (next.done) {
            controller.close();
            return;
          }
          controller.enqueue(
            encoder.encode(next.value.map(auditCsvLine).join("")),
          );
        } catch (error) {
          logError(error as Error, {
            action: "audit-log.export",
            organizationId: scope.organizationId,
          });
          controller.error(error);
        }
      },
      async cancel() {
        await rows.return(undefined);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${auditCsvFilename(workspace.slug, now)}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleError(error, { route: "settings/audit-log/export" });
  }
}
