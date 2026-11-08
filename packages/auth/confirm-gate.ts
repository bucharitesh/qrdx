import { and, database as db, eq, verification } from "@repo/database";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { confirmedSessionIdentifier } from "./confirm-sign-in-rules";

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

export const CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED";

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
        eq(verification.identifier, confirmedSessionIdentifier(sessionId)),
        eq(verification.value, userId)
      )
    );
  return rows.some(
    (row: { expiresAt: Date | string }) =>
      new Date(row.expiresAt).getTime() > now.getTime()
  );
}

export function confirmationRequiredError(): APIError {
  return new APIError("FORBIDDEN", {
    code: CONFIRMATION_REQUIRED,
    message: "Confirm it's you first, then try again.",
  });
}

interface SignedIn {
  session: { id: string };
  user: { id: string };
}

/**
 * The hook's decision. Throws CONFIRMATION_REQUIRED for an HTTP request that
 * needs a confirmation this session doesn't have; anything else passes.
 */
export async function checkConfirmGate(
  request: { http: boolean; path: string; body: unknown },
  signedIn: () => Promise<SignedIn | null>,
  confirmed: (sessionId: string, userId: string) => Promise<boolean> = (
    sessionId,
    userId
  ) => sessionConfirmed(sessionId, userId)
): Promise<void> {
  if (!request.http) return;
  if (!needsConfirmation(request.path, request.body)) return;
  const found = await signedIn();
  // Signed out: the endpoint refuses it on its own.
  if (!found) return;
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
              () => getSessionFromCtx(ctx)
            )
          ),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
