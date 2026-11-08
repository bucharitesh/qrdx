import type { BetterAuthPlugin } from "better-auth";
import {
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import { confirmationRequiredError } from "./confirm-gate";
import {
  HELD_SESSION_OPEN_PATHS,
  originChanged,
  originExpiresAt,
  SESSION_HOLD_AWARE,
  type SessionOriginReader,
  sessionOriginIdentifier,
  sessionOriginReader,
} from "./session-origin-rules";

// The stolen-session check (./session-origin-rules.ts has the rules), on
// Better Auth's side:
//
// - When a session is created, its origin country is stored in a
//   `verification` row keyed by the session's id (no schema change), from
//   the request that made it, sign-ins and the app's own session swaps
//   alike. It lasts as long as a session can (originExpiresAt). The
//   origin's browser family is the session row's user agent.
// - Every session read through auth.api.getSession or GET /get-session
//   (all of the app's, and the browser's) answers null for a held session,
//   except the app's hold-aware reads (SESSION_HOLD_AWARE): pages, server
//   actions and routes treat it as signed out, so nothing is read or changed
//   with it.
// - Every other endpoint over HTTP refuses a held session with
//   CONFIRMATION_REQUIRED, except signing out and signing in again
//   (HELD_SESSION_OPEN_PATHS). Better Auth's own endpoints read the session
//   without going through /get-session's hooks, so this covers them.
//
// Cheap by design: the browser family is compared with the session row's
// user agent first, which every session read already has, and only when it
// differs and the request's country is known is the origin row read. For the
// person who signed in that never happens, so there's no extra query on
// their requests.
//
// The app registers how a request's place is read (registerSessionOriginReader).
// Without it nothing is held and nothing recorded, and that's logged as an
// error: it's a wiring bug, never a reason to sign everyone out.

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
type AuthContext = HookContext["context"];

/** What the check needs from a session. */
export interface HoldableSession {
  id: string;
  userAgent?: string | null;
}

/** Reads a session's origin country (null: none recorded, or expired). */
export type OriginCountryReader = (sessionId: string) => Promise<string | null>;

// No ids, emails or addresses in these logs.
function log(level: "info" | "error", fields: Record<string, unknown>) {
  console[level](JSON.stringify({ event: "auth.session_origin", ...fields }));
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return { error: "unknown" };
  return {
    error: error.name,
    message: error.message.split(/\bparams:/)[0].slice(0, 300),
  };
}

let missingReaderLogged = false;

/** The app's reader; logs (once per process) when there's none. */
function reader(): SessionOriginReader | null {
  const found = sessionOriginReader();
  if (!(found || missingReaderLogged)) {
    missingReaderLogged = true;
    log("error", { outcome: "no-reader" });
  }
  return found;
}

/**
 * Whether `session`, used by a request with `headers`, is held. Reads the
 * origin row only when the browser family differs from the session's own and
 * the request's country is known.
 */
export async function sessionHeld(
  session: HoldableSession,
  headers: Headers | null | undefined,
  readCountry: OriginCountryReader
): Promise<boolean> {
  if (!session?.id) return false;
  const read = reader();
  if (!(read && headers)) return false;
  const country = read.country(headers);
  if (!country) return false;
  const browser = read.browser(headers.get("user-agent"));
  const startedBrowser = read.browser(session.userAgent ?? null);
  if (browser === startedBrowser) return false;
  const startedCountry = await readCountry(session.id);
  return originChanged(
    { country: startedCountry, browser: startedBrowser },
    { country, browser }
  );
}

/** The origin country stored for a session, through Better Auth's adapter. */
export function adapterOriginCountry(
  adapter: AuthContext["adapter"]
): OriginCountryReader {
  return async (sessionId) => {
    const rows = await adapter.findMany<{
      value: string;
      expiresAt: Date | string;
    }>({
      model: "verification",
      where: [
        { field: "identifier", value: sessionOriginIdentifier(sessionId) },
      ],
      limit: 1,
    });
    const row = rows[0];
    if (!row || new Date(row.expiresAt).getTime() <= Date.now()) return null;
    return row.value || null;
  };
}

/** A hold-aware read: the app's own auth.api call that asked to see it. */
function holdAware(ctx: HookContext): boolean {
  if (ctx.request instanceof Request) return false;
  const query = ctx.query as Record<symbol, unknown> | undefined;
  return query?.[SESSION_HOLD_AWARE] === true;
}

interface CreatedSession {
  id: string;
  createdAt: Date | string;
  expiresAt: Date | string;
}

/** Stores a new session's origin country, from the request that made it. */
async function recordOrigin(
  auth: AuthContext,
  session: CreatedSession,
  headers: Headers | null | undefined
): Promise<void> {
  if (!headers) return;
  const read = reader();
  if (!read) return;
  const country = read.country(headers);
  // Unknown: no row, so this session is never held.
  if (!country) return;
  await auth.internalAdapter.createVerificationValue({
    identifier: sessionOriginIdentifier(session.id),
    value: country,
    expiresAt: originExpiresAt(session),
  });
}

/**
 * A session Better Auth extended past its origin row's expiry keeps the row
 * alive with it. With sessions capped at SESSION_ORIGIN_DAYS this never runs,
 * so refreshes cost nothing.
 */
async function outliveWithSession(
  auth: AuthContext,
  session: CreatedSession | null
): Promise<void> {
  if (!(session?.id && session.createdAt && session.expiresAt)) return;
  const expiresAt = new Date(session.expiresAt);
  if (originExpiresAt(session).getTime() > expiresAt.getTime()) return;
  await auth.adapter.updateMany({
    model: "verification",
    where: [
      { field: "identifier", value: sessionOriginIdentifier(session.id) },
    ],
    update: { expiresAt, updatedAt: new Date() },
  });
}

export const sessionOriginGuard = () => {
  let auth: AuthContext | null = null;
  return {
    id: "qrdx-session-origin",
    init(context) {
      auth = context as AuthContext;
      return {
        options: {
          databaseHooks: {
            session: {
              create: {
                // Never blocks or fails a sign-in.
                after: async (session, endpoint) => {
                  if (!auth) return;
                  try {
                    const headers =
                      endpoint?.headers ?? endpoint?.request?.headers ?? null;
                    await recordOrigin(auth, session, headers);
                  } catch (error) {
                    log("error", {
                      outcome: "record-failed",
                      ...describeError(error),
                    });
                  }
                },
              },
              update: {
                after: async (session) => {
                  if (!auth) return;
                  try {
                    await outliveWithSession(
                      auth,
                      session as CreatedSession | null
                    );
                  } catch (error) {
                    log("error", {
                      outcome: "expiry-failed",
                      ...describeError(error),
                    });
                  }
                },
              },
            },
          },
        },
      };
    },
    hooks: {
      before: [
        {
          matcher: (ctx) =>
            ctx.request instanceof Request &&
            !HELD_SESSION_OPEN_PATHS.includes(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const found = await getSessionFromCtx(ctx);
            if (!found?.session) return;
            let held = false;
            try {
              held = await sessionHeld(
                found.session,
                ctx.headers,
                adapterOriginCountry(ctx.context.adapter)
              );
            } catch (error) {
              log("error", {
                outcome: "check-failed",
                ...describeError(error),
              });
              return;
            }
            if (!held) return;
            log("info", { outcome: "held", path: ctx.path });
            // The same answer as an action that needs a recent confirmation.
            throw confirmationRequiredError();
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            if (holdAware(ctx)) return;
            const returned = ctx.context.returned as
              | { session?: HoldableSession | null }
              | null
              | undefined;
            if (
              !returned ||
              isAPIError(returned) ||
              returned instanceof Response
            ) {
              return;
            }
            const session = returned.session;
            if (!session?.id) return;
            let held = false;
            try {
              held = await sessionHeld(
                session,
                ctx.headers,
                adapterOriginCountry(ctx.context.adapter)
              );
            } catch (error) {
              log("error", {
                outcome: "check-failed",
                ...describeError(error),
              });
              return;
            }
            if (!held) return;
            log("info", {
              outcome: "held",
              path: ctx.path,
              http: ctx.request instanceof Request,
            });
            return ctx.json(null);
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
};
