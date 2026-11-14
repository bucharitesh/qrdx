import "server-only";

import { randomUUID } from "node:crypto";
import { auth } from "@repo/auth/server";
import { type HoldableSession, sessionHeld } from "@repo/auth/session-origin";
import {
  holdAwareQuery,
  originExpiresAt,
  sessionOriginIdentifier,
} from "@repo/auth/session-origin-rules";
import {
  database as db,
  session as sessionTable,
  verification,
} from "@repo/database";
import { and, eq, gt } from "drizzle-orm";
import {
  appSessionOriginReader,
  registerAppSessionOriginReader,
} from "./session-origin";

// The stolen-session check on the app's server (./session-origin.ts says
// what it is; packages/auth/session-origin.ts holds sessions in Better
// Auth). instrumentation.ts registers the reader at start-up; registering
// here too covers any server that loads this before that.
registerAppSessionOriginReader();

/** The origin country stored for a session, or null (none, or expired). */
export async function readOriginCountry(
  sessionId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ value: verification.value })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, sessionOriginIdentifier(sessionId)),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row?.value || null;
}

/** Whether this session, used with these request headers, is held. */
export function isSessionHeld(
  session: HoldableSession,
  requestHeaders: Headers,
): Promise<boolean> {
  return sessionHeld(session, requestHeaders, readOriginCountry);
}

interface FoundSession {
  user: { id: string; email: string; name?: string | null };
  session: {
    id: string;
    createdAt: Date | string;
    userAgent?: string | null;
  };
}

/**
 * The session, held or not. Only for the places that must see a held one:
 * the proxy (to send it to the check), "Confirm it's you" and the actions it
 * gates (to answer CONFIRMATION_REQUIRED). Every other read uses
 * auth.api.getSession as usual and gets null for a held session.
 */
export async function getSessionAllowingHold(
  requestHeaders: Headers,
): Promise<FoundSession | null> {
  const found = (await auth.api.getSession({
    headers: requestHeaders,
    query: holdAwareQuery(),
  })) as FoundSession | null;
  return found?.user?.id ? found : null;
}

/**
 * After "Confirm it's you": where the session is now becomes where it
 * started. The session row takes this request's user agent (its browser
 * family is the origin's) and the origin row this request's country; no
 * country known, no row (never held).
 */
export async function moveSessionOrigin(
  session: { sessionId: string; userId: string },
  requestHeaders: Headers,
): Promise<void> {
  const now = new Date();
  const [row] = await db
    .update(sessionTable)
    .set({ userAgent: requestHeaders.get("user-agent") ?? "", updatedAt: now })
    .where(
      and(
        eq(sessionTable.id, session.sessionId),
        eq(sessionTable.userId, session.userId),
      ),
    )
    .returning({
      createdAt: sessionTable.createdAt,
      expiresAt: sessionTable.expiresAt,
    });
  // Signed out meanwhile: nothing to move.
  if (!row) return;
  const identifier = sessionOriginIdentifier(session.sessionId);
  const country = appSessionOriginReader.country(requestHeaders);
  const clear = db
    .delete(verification)
    .where(eq(verification.identifier, identifier));
  if (!country) {
    await clear;
    return;
  }
  await db.batch([
    clear,
    db.insert(verification).values({
      id: randomUUID(),
      identifier,
      value: country,
      expiresAt: originExpiresAt(row),
      createdAt: now,
      updatedAt: now,
    }),
  ]);
}
