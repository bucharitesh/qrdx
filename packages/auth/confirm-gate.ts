import { and, database as db, eq, verification } from "@repo/database";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { confirmationRequiredError } from "./confirm-error";
import { confirmedIdentifier } from "./confirm-sign-in-rules";
import {
  adapterOriginCountry,
  type HoldableSession,
  sessionHeld,
} from "./session-origin";

// "Confirm it's you" for Better Auth's own endpoints, over HTTP. The app's
// server actions ask first (apps/docs/lib/account/confirmation-server.tsx)
// before linking or unlinking Google or GitHub and before the workspace
// changes that need it, and call these endpoints through auth.api. The same
// endpoints are also open over HTTP, where a stolen session cookie alone
// could reach them; this refuses those requests unless the session confirmed
// in the last 10 minutes (the app's `verification` row).
//
// Only HTTP requests are checked. auth.api calls come from the app's server
// actions, which have checked already with the app's full rules (on a
// deployment that can't email codes, a sign-in in the last 10 minutes also
// counts), and from flows such as account deletion that confirmed at their
// start.
//
// Signing out other sessions (/revoke-session, /revoke-other-sessions,
// /revoke-sessions) is never gated: someone whose account is under attack
// must be able to sign the attacker out at once.
//
// A held session (the stolen-session check, ./session-origin.ts) is refused
// here too, even with a confirmation on record: the guard there lets a
// request through when its own check fails, and these are the endpoints
// that matter most. Here a check that fails refuses.

export {
  CONFIRMATION_REQUIRED,
  confirmationRequiredError,
} from "./confirm-error";

/** Gated whatever the request asks. */
const ALWAYS_GATED = new Set([
  // Linking signs in to QRdx with another account from then on; the app's
  // "Link" goes through a server action (linkSignInMethod).
  "/link-social",
  "/unlink-account",
  "/organization/delete",
  "/organization/update-member-role",
  "/organization/remove-member",
]);
/** Gated when it would give the admin or owner role. */
const INVITE_PATH = "/organization/invite-member";
const PRIVILEGED_ROLES = new Set(["admin", "owner"]);

export const CONFIRM_GATED_PATHS = [...ALWAYS_GATED, INVITE_PATH];

/** The roles in a role field: "admin", "admin,member" or ["admin"]. */
function rolesIn(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .filter((part): part is string => typeof part === "string")
    .flatMap((part) => part.split(","))
    .map((part) => part.trim());
}

/** Whether a request to `path` with `body` needs a recent confirmation. */
export function needsConfirmation(path: string, body: unknown): boolean {
  if (ALWAYS_GATED.has(path)) return true;
  if (path !== INVITE_PATH) return false;
  const role = (body as { role?: unknown } | null | undefined)?.role;
  return rolesIn(role).some((name) => PRIVILEGED_ROLES.has(name));
}

/** This session's person confirmed it's them in the last 10 minutes. */
export async function sessionConfirmed(
  sessionId: string,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const rows = await db
    .select({ expiresAt: verification.expiresAt })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, confirmedIdentifier(sessionId)),
        eq(verification.value, userId)
      )
    );
  return rows.some(
    (row: { expiresAt: Date | string }) =>
      new Date(row.expiresAt).getTime() > now.getTime()
  );
}

interface SignedIn {
  session: HoldableSession;
  user: { id: string };
}

/** Whether the request's session is held (./session-origin.ts). */
type HeldCheck = (session: HoldableSession) => Promise<boolean>;

const notHeld: HeldCheck = () => Promise.resolve(false);

/**
 * The hook's decision. Throws CONFIRMATION_REQUIRED for an HTTP request that
 * needs a confirmation this session doesn't have, or that comes from a held
 * session (or one the hold check couldn't clear); anything else passes.
 */
export async function checkConfirmGate(
  request: { http: boolean; path: string; body: unknown },
  signedIn: () => Promise<SignedIn | null>,
  confirmed: (sessionId: string, userId: string) => Promise<boolean> = (
    sessionId,
    userId
  ) => sessionConfirmed(sessionId, userId),
  held: HeldCheck = notHeld
): Promise<void> {
  if (!request.http) return;
  if (!needsConfirmation(request.path, request.body)) return;
  const found = await signedIn();
  // Signed out: the endpoint refuses it on its own.
  if (!found) return;
  let isHeld = true;
  try {
    isHeld = await held(found.session);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "auth.confirm_gate",
        outcome: "hold-check-failed",
        path: request.path,
        error: error instanceof Error ? error.name : "unknown",
      })
    );
  }
  if (isHeld) throw confirmationRequiredError();
  if (await confirmed(found.session.id, found.user.id)) return;
  throw confirmationRequiredError();
}

export const confirmGate = () =>
  ({
    id: "qrdx-confirm-gate",
    hooks: {
      before: [
        {
          matcher: (ctx) => CONFIRM_GATED_PATHS.includes(ctx.path ?? ""),
          handler: createAuthMiddleware((ctx) =>
            checkConfirmGate(
              {
                http: ctx.request instanceof Request,
                path: ctx.path,
                body: ctx.body,
              },
              () => getSessionFromCtx(ctx),
              undefined,
              (session) =>
                sessionHeld(
                  session,
                  ctx.headers,
                  adapterOriginCountry(ctx.context.adapter)
                )
            )
          ),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
