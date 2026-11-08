import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

// How long a sign-in lasts. Better Auth keeps a session for 7 days after it
// was last refreshed and refreshes it at most once a day while it's used
// (its defaults: `session.expiresIn` 7 days, `updateAge` 1 day), so a
// session that's used every few days would never end. This caps it: a
// session ends SESSION_MAX_DAYS after its sign-in (`session.createdAt`),
// however much it's used, and then the person signs in again.
//
// - The refresh never moves `expiresAt` past the cap: a database hook on
//   session updates clamps it (the refresh in Better Auth's getSession is the
//   only thing that moves it, and it sets the found session on the endpoint
//   context just before, which is where the sign-in time comes from).
// - A session past the cap is refused even if its row says otherwise (rows
//   refreshed before this shipped, or written outside Better Auth): every
//   Better Auth call reads sessions through a per-request wrapper of its
//   internal adapter, which reports a session past the cap as expired.
//   Better Auth then does what it does with any expired session: deletes
//   the row and the cookie and answers signed out. That covers the app's
//   auth.api.getSession, /get-session, and every endpoint that reads the
//   session itself.
// - Once a session's expiry sits at the cap, Better Auth would "refresh" it
//   on every request of its last days (its refresh check only looks at the
//   expiry), each a write that changes nothing. The wrapper skips those,
//   still writing once a day so the session's last-active time stays right.

export const SESSION_MAX_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_MAX_MS = SESSION_MAX_DAYS * DAY_MS;

type DateLike = Date | string | number;

const time = (value: DateLike) => new Date(value).getTime();

/**
 * The latest a session signed in at `createdAt` can last. A sign-in time that
 * can't be read counts as long gone, so such a session is refused.
 */
export function sessionCapAt(createdAt: DateLike): Date {
  const start = time(createdAt);
  return new Date(Number.isFinite(start) ? start + SESSION_MAX_MS : 0);
}

/** Whether a session signed in at `createdAt` has reached the cap. */
export function sessionPastCap(
  createdAt: DateLike,
  now: Date = new Date()
): boolean {
  return sessionCapAt(createdAt).getTime() <= now.getTime();
}

/** `expiresAt`, or the cap when that's later. */
export function clampSessionExpiry(
  createdAt: DateLike,
  expiresAt: DateLike
): Date {
  const cap = sessionCapAt(createdAt);
  const expires = time(expiresAt);
  return Number.isFinite(expires) && expires <= cap.getTime()
    ? new Date(expires)
    : cap;
}

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
type AuthContext = HookContext["context"];
type InternalAdapter = AuthContext["internalAdapter"];

interface StoredSession {
  token: string;
  createdAt: DateLike;
  expiresAt: DateLike;
  updatedAt: DateLike;
}

const WRAPPED = Symbol.for("@repo/auth/session-lifetime");
const REFRESH_FIELDS = new Set(["expiresAt", "updatedAt"]);

/** Only what Better Auth's refresh writes: the expiry and updatedAt. */
function isRefresh(data: Record<string, unknown>): data is {
  expiresAt: Date;
  updatedAt?: Date;
} {
  return (
    data.expiresAt instanceof Date &&
    Object.keys(data).every((key) => REFRESH_FIELDS.has(key))
  );
}

/**
 * The internal adapter for one request, with sessions past the cap reported
 * as expired, refreshes clamped to the cap, and refreshes that would change
 * nothing (expiry already at the cap, updated in the last `updateAgeSeconds`)
 * skipped. The sessions it has read are kept for this request only, by
 * token, and an update only ever uses the one read for its own token.
 */
export function capSessions(
  adapter: InternalAdapter,
  {
    updateAgeSeconds,
    now = () => new Date(),
  }: { updateAgeSeconds: number; now?: () => Date }
): InternalAdapter {
  if ((adapter as unknown as Record<symbol, unknown>)[WRAPPED]) return adapter;
  const read = new Map<string, StoredSession & Record<string, unknown>>();

  const findSession: InternalAdapter["findSession"] = async (token) => {
    const found = await adapter.findSession(token);
    if (!found) return found;
    const session = found.session as unknown as StoredSession &
      Record<string, unknown>;
    read.set(session.token, session);
    const capped = clampSessionExpiry(session.createdAt, session.expiresAt);
    if (capped.getTime() === time(session.expiresAt)) return found;
    return { ...found, session: { ...found.session, expiresAt: capped } };
  };

  const updateSession = ((token: string, data: Record<string, unknown>) => {
    const stored = read.get(token);
    if (!(stored && isRefresh(data))) {
      return adapter.updateSession(token, data);
    }
    const expiresAt = clampSessionExpiry(stored.createdAt, data.expiresAt);
    const unchanged = expiresAt.getTime() === time(stored.expiresAt);
    const recent =
      now().getTime() - time(stored.updatedAt) < updateAgeSeconds * 1000;
    if (unchanged && recent) {
      return Promise.resolve({ ...stored, expiresAt });
    }
    return adapter.updateSession(token, { ...data, expiresAt });
  }) as InternalAdapter["updateSession"];

  const listSessions: InternalAdapter["listSessions"] = async (...args) => {
    const sessions = await adapter.listSessions(...args);
    const at = now();
    return sessions.filter((session) => !sessionPastCap(session.createdAt, at));
  };

  return {
    ...adapter,
    findSession,
    updateSession,
    listSessions,
    [WRAPPED]: true,
  } as InternalAdapter;
}

/** Endpoint context as the database hooks receive it (null outside one). */
interface HookEndpointContext {
  context?: { session?: { session?: { createdAt?: DateLike } } | null };
}

/**
 * The database hook: an update that moves a session's expiry never moves it
 * past the cap of the session being refreshed (the endpoint's session).
 */
export function clampRefresh(
  data: Record<string, unknown>,
  endpoint: HookEndpointContext | null | undefined
): { data: Record<string, unknown> } | undefined {
  if (!(data.expiresAt instanceof Date)) return;
  const createdAt = endpoint?.context?.session?.session?.createdAt;
  if (createdAt === undefined) {
    // Not a refresh from getSession (nothing else moves the expiry today).
    // The read-time check still refuses the session once it's past the cap.
    console.warn(
      JSON.stringify({ event: "auth.session_cap", outcome: "no-session" })
    );
    return;
  }
  const expiresAt = clampSessionExpiry(createdAt, data.expiresAt);
  if (expiresAt.getTime() === data.expiresAt.getTime()) return;
  return { data: { ...data, expiresAt } };
}

export const sessionLifetime = () =>
  ({
    id: "qrdx-session-lifetime",
    init: () => ({
      options: {
        databaseHooks: {
          session: {
            update: {
              before: (data, endpoint) =>
                Promise.resolve(
                  clampRefresh(
                    data as Record<string, unknown>,
                    endpoint as HookEndpointContext | null
                  )
                ),
            },
          },
        },
      },
    }),
    hooks: {
      before: [
        {
          // Every call, so every session read in it goes through the cap.
          // Costs no query: it only wraps this request's adapter.
          matcher: () => true,
          handler: createAuthMiddleware((ctx) => {
            ctx.context.internalAdapter = capSessions(
              ctx.context.internalAdapter,
              { updateAgeSeconds: ctx.context.sessionConfig.updateAge }
            );
            // A session an earlier hook already read (it went straight to
            // the database): read it again through the cap.
            const earlier = ctx.context.session?.session;
            if (earlier && sessionPastCap(earlier.createdAt)) {
              ctx.context.session = null;
            }
            return Promise.resolve();
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
