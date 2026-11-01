import { database as db, user } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/app/admin/_lib/audit";
import { getAdminUser } from "@/app/admin/_lib/guard";
import { requiredReason } from "@/app/admin/_lib/rules";
import { exportArchiveStream } from "@/lib/account/export/archive";
import { EXPORT_INTRO, exportEntries } from "@/lib/account/export/entries";
import { logError } from "@/lib/shared";

// Support → Export data: the same ZIP the user gets from Settings → Account,
// for one user, by an admin. POST from the 360 page's form (with a reason);
// admin is re-checked here and the export is written to the audit log.

export const maxDuration = 300;

const exportLimiter = createRateLimiter({
  prefix: "qrdx:admin-export",
  limiter: slidingWindow(5, "1 h"),
});

// CSV files stop early past this, so the response finishes within maxDuration.
const BUILD_BUDGET_MS = 240_000;

const notFound = () =>
  new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });

const fail = (status: number, message: string) =>
  new NextResponse(message, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
  });

/** Only this site's own pages may start an export. */
function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return notFound();
  if (!isSameOrigin(request)) return fail(403, "Start the export from QRdx.");

  const { success } = await exportLimiter.limit(admin.id);
  if (!success) return fail(429, "Too many exports. Try again in an hour.");

  const form = await request.formData().catch(() => null);
  const reason = requiredReason.safeParse(form?.get("reason") ?? "");
  if (!reason.success) {
    return fail(400, reason.error.issues[0]?.message ?? "Add a reason.");
  }

  const { userId } = await params;
  const [target] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) return notFound();

  await writeAuditLog({
    actor: admin,
    action: "user.export",
    targetType: "user",
    targetId: target.id,
    metadata: {
      targetEmail: target.email,
      subjectUserId: target.id,
      reason: reason.data,
    },
  });

  const generatedAt = new Date();
  const stream = exportArchiveStream({
    entries: exportEntries(target.id),
    intro: EXPORT_INTRO,
    generatedAt,
    deadline: generatedAt.getTime() + BUILD_BUDGET_MS,
    onError: (cause) =>
      logError(cause as Error, { action: "admin.export", userId: target.id }),
  });
  const day = generatedAt.toISOString().slice(0, 10);

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="qrdx-data-${target.id}-${day}.zip"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
