import type { NextRequest } from "next/server";
import { responsesToCsv } from "@/app/api/forms/_lib/csv";
import {
  getInboxPage,
  listPageResponses,
} from "@/app/api/forms/_lib/responses";
import { handleError } from "@/lib/error-response";
import { getActiveScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 50_000;

const fileSlug = (title: string | null) =>
  (title ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "") || "page";

/** CSV of a page's form responses (newest first), optionally one form's only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await getActiveScope(request.headers);
    const { id } = await params;
    const page = await getInboxPage(scope, id);
    const form = request.nextUrl.searchParams.get("form") || null;
    const responses = await listPageResponses(page.id, {
      block: form,
      limit: MAX_EXPORT_ROWS,
    });
    const forms = page.forms
      .filter((candidate) => !form || candidate.id === form)
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        fields: candidate.fields.map(({ id: fieldId, label }) => ({
          id: fieldId,
          label,
        })),
      }));
    const date = new Date().toISOString().slice(0, 10);

    // BOM so Excel reads visitors' non-ASCII answers as UTF-8.
    return new Response(`\uFEFF${responsesToCsv(responses, forms)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="qrdx-${fileSlug(page.title)}-responses-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleError(error, { route: "dashboard/pages/responses/export" });
  }
}
