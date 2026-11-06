import { NextResponse } from "next/server";
import { confirmAuthenticatorSetup } from "@/lib/account/two-factor-manage";

// Settings → Profile & security → Two-step verification: confirming an
// authenticator app. As the first method it swaps the session for a new one,
// so it answers from a route handler (a server action would re-render the
// page with the old, deleted session; lib/account/two-factor-manage.ts).
// Same checks as the server actions: a session, a recent "Confirm it's
// you", limits.

const NO_STORE = { "Cache-Control": "no-store" };

/** Only the app's own pages may call this (a browser always sends Origin). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!(origin && host)) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "Cross-origin request rejected." },
      { status: 403, headers: NO_STORE },
    );
  }
  let body: { step?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400, headers: NO_STORE },
    );
  }
  const result =
    body?.step === "confirm"
      ? await confirmAuthenticatorSetup({ code: body?.code })
      : ({ ok: false, error: "Unknown step." } as const);
  return NextResponse.json(result, { headers: NO_STORE });
}
