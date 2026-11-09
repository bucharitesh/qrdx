"use server";

import { requireAuditLogAccess } from "@/ee/audit-log/access";
import { parseAuditFilter } from "@/ee/audit-log/filter";
import { type AuditPage, listAuditEvents } from "@/ee/audit-log/queries";
import { HttpError } from "@/lib/error-response";
import { getActiveWorkspace } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// Settings → Audit log → Load more. The workspace comes from the page's URL
// (lib/scope.ts), never from the client; the filter is parsed like the
// page's own query.

export type AuditActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function loadMoreAuditEvents(input: {
  filter: Record<string, string>;
  cursor: string;
}): Promise<AuditActionResult<AuditPage>> {
  try {
    const { scope, workspace } = await getActiveWorkspace();
    await requireAuditLogAccess(scope);
    const filter = parseAuditFilter(
      input?.filter && typeof input.filter === "object" ? input.filter : {},
    );
    const cursor = typeof input?.cursor === "string" ? input.cursor : null;
    return {
      ok: true,
      data: await listAuditEvents(
        { organizationId: scope.organizationId, slug: workspace.slug },
        filter,
        cursor,
      ),
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ok: false, error: "Sign in to see the audit log." };
    }
    if (error instanceof HttpError) return { ok: false, error: error.message };
    logError(error as Error, { action: "audit-log.load-more" });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
