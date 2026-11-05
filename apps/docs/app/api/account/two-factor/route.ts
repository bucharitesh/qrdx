import { NextResponse } from "next/server";
import {
  confirmTwoFactorSetup,
  turnOffTwoFactor,
} from "@/lib/account/two-factor-manage";

// Settings → Profile & security → Two-step verification: confirming setup and
// turning it off. Both swap the session for a new one, so they answer from a
// route handler (a server action would re-render the page with the old,
// deleted session; lib/account/two-factor-manage.ts). Same checks as the
// server actions: a session, a recent sign-in or a current code, limits.

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
  const input = { code: body?.code };
  const result =
    body?.step === "confirm"
      ? await confirmTwoFactorSetup(input)
      : body?.step === "turn-off"
        ? await turnOffTwoFactor(input)
        : ({ ok: false, error: "Unknown step." } as const);
  return NextResponse.json(result, { headers: NO_STORE });
}
