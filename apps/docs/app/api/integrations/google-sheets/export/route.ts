import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { dataErrorResponse, jsonError, requireUser } from "@/lib/data-connections/http";
import {
  exportResponsesToSheet,
  exportScansToSheet,
} from "@/lib/data-connections/settings";
import { readJsonBody, parseWithSchema } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";

export const runtime = "nodejs";
export const maxDuration = 60;

// Each export creates a spreadsheet: a few per minute per person.
const exportLimiter = createRateLimiter({
  limiter: slidingWindow(5, "60 s"),
  prefix: "qrdx:integrations:sheets-export",
});

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scans"), codeId: id.nullable() }),
  z.object({ kind: z.literal("responses"), pageId: id }),
]);

/**
 * POST /api/integrations/google-sheets/export — a new spreadsheet with the
 * active workspace's scans (one code or all) or one page's form responses.
 */
export async function POST(request: Request) {
  const user = await requireUser(exportLimiter, "integrations:sheets-export");
  if ("response" in user) return user.response;
  try {
    const body = parseWithSchema(bodySchema, await readJsonBody(request, 4096));
    const scope = await getActiveScope(request.headers);
    if (scope.userId !== user.userId) {
      return jsonError(401, "UNAUTHORIZED", "Unauthorized");
    }
    if (body.kind === "scans") {
      const result = await exportScansToSheet(scope, body.codeId);
      return Response.json({
        url: result.spreadsheetUrl,
        rows: result.rowsWritten,
        truncated: result.truncated,
        label: result.label,
      });
    }
    const result = await exportResponsesToSheet(scope, body.pageId);
    return Response.json({
      url: result.spreadsheetUrl,
      rows: result.rows,
      truncated: result.truncated,
    });
  } catch (error) {
    return dataErrorResponse(error, {
      userId: user.userId,
      provider: "google-sheets",
      action: "export",
    });
  }
}
