import { auth } from "@repo/auth/server";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { exportArchiveStream } from "@/lib/account/export/archive";
import { EXPORT_INTRO, exportEntries } from "@/lib/account/export/entries";
import { logError } from "@/lib/shared";

// "Download my data" (Settings → Account): a ZIP of everything QRdx keeps
// about the signed-in user, streamed while it is built.

export const maxDuration = 300;

// Each export reads every table the user has rows in.
const exportLimiter = createRateLimiter({
  prefix: "qrdx:account-export",
  limiter: slidingWindow(3, "1 h"),
});

// CSV files stop early past this, so the response finishes within maxDuration.
const BUILD_BUDGET_MS = 240_000;

function error(status: number, code: string, message: string, init = {}) {
  return NextResponse.json(
    { code, message },
    { status, headers: { "Cache-Control": "no-store" }, ...init },
  );
}

/** Only this site's own pages may start an export. */
function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return error(403, "FORBIDDEN", "Start the download from QRdx.");
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const userId: string | undefined = session?.user?.id;
  if (!userId) {
    return error(401, "UNAUTHORIZED", "Sign in to download your data.");
  }

  const { success, reset } = await exportLimiter.limit(userId);
  if (!success) {
    const seconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    const minutes = Math.ceil(seconds / 60);
    return error(
      429,
      "RATE_LIMITED",
      `You can download your data 3 times an hour. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
      {
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(seconds),
        },
      },
    );
  }

  const generatedAt = new Date();
  const stream = exportArchiveStream({
    entries: exportEntries(userId),
    intro: EXPORT_INTRO,
    generatedAt,
    deadline: generatedAt.getTime() + BUILD_BUDGET_MS,
    onError: (cause) =>
      logError(cause as Error, { action: "account.export", userId }),
  });
  const day = generatedAt.toISOString().slice(0, 10);

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="qrdx-data-${day}.zip"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
