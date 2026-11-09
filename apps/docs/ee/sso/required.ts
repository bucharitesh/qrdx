import "server-only";

import type { SsoRequirement } from "@repo/auth/sso-required";
import {
  holdsOwnerRole,
  parseSsoMarker,
  ssoSessionIdentifier,
} from "@repo/auth/sso-required-rules";
import { emailInSsoDomain } from "@repo/auth/sso-rules";
import {
  database as db,
  member,
  session as sessionTable,
  user,
  verification,
} from "@repo/database";
import { and, eq, gt, ilike, inArray, or } from "drizzle-orm";

// "Require single sign-on for <domain>": what turning it on does to the
// sessions people already have (packages/auth/ee/sso-required.ts enforces
// it from then on). Called by ee/sso/connections.ts after the setting is
// saved.

const CHUNK = 500;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

interface Marker {
  userId: string;
  providerId: string;
  expiresAt: Date;
}

/** The live SSO markers of these sessions, by session id. */
async function liveMarkers(
  sessionIds: string[],
  now: Date,
): Promise<Map<string, Marker>> {
  const found = new Map<string, Marker>();
  for (const ids of chunks(sessionIds)) {
    const rows = await db
      .select({
        identifier: verification.identifier,
        value: verification.value,
        expiresAt: verification.expiresAt,
      })
      .from(verification)
      .where(
        and(
          inArray(verification.identifier, ids.map(ssoSessionIdentifier)),
          gt(verification.expiresAt, now),
        ),
      );
    for (const row of rows) {
      const marker = parseSsoMarker(row.value);
      if (!marker) continue;
      const sessionId = ids.find(
        (id) => ssoSessionIdentifier(id) === row.identifier,
      );
      if (sessionId) {
        found.set(sessionId, { ...marker, expiresAt: new Date(row.expiresAt) });
      }
    }
  }
  return found;
}

/**
 * Whether this session came from an SSO sign-in through `providerId` in the
 * last 24 hours (its marker, packages/auth/ee/sso-required.ts).
 */
export async function sessionCameFromSso(
  sessionId: string,
  userId: string,
  providerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const marker = (await liveMarkers([sessionId], now)).get(sessionId);
  return marker?.userId === userId && marker.providerId === providerId;
}

/**
 * Everyone the requirement binds (an address at the domain or a subdomain,
 * not an owner of the workspace) is signed out of each session that didn't
 * come from an SSO sign-in through the connection in the last 24 hours. The
 * sessions that did now end 24 hours after that sign-in. Returns how many
 * sessions were signed out.
 */
export async function endSessionsWithoutSso(
  requirement: SsoRequirement,
  now: Date = new Date(),
): Promise<number> {
  const { domain, organizationId, providerId } = requirement;
  const people = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      or(ilike(user.email, `%@${domain}`), ilike(user.email, `%.${domain}`)),
    );
  const members = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  const owners = new Set(
    members.filter((m) => holdsOwnerRole(m.role)).map((m) => m.userId),
  );
  const bound = people
    .filter((p) => emailInSsoDomain(p.email, domain) && !owners.has(p.id))
    .map((p) => p.id);

  let signedOut = 0;
  for (const userIds of chunks(bound)) {
    const sessions = await db
      .select({
        id: sessionTable.id,
        userId: sessionTable.userId,
        expiresAt: sessionTable.expiresAt,
      })
      .from(sessionTable)
      .where(inArray(sessionTable.userId, userIds));
    if (sessions.length === 0) continue;
    const markers = await liveMarkers(
      sessions.map((s) => s.id),
      now,
    );
    const end: string[] = [];
    for (const session of sessions) {
      const marker = markers.get(session.id);
      if (
        !marker ||
        marker.userId !== session.userId ||
        marker.providerId !== providerId
      ) {
        end.push(session.id);
      } else if (
        new Date(session.expiresAt).getTime() > marker.expiresAt.getTime()
      ) {
        await db
          .update(sessionTable)
          .set({ expiresAt: marker.expiresAt })
          .where(eq(sessionTable.id, session.id));
      }
    }
    for (const ids of chunks(end)) {
      await db.delete(sessionTable).where(inArray(sessionTable.id, ids));
    }
    signedOut += end.length;
  }
  return signedOut;
}
