import "server-only";

import {
  database as db,
  oauthApp,
  oauthAuthorizationCode,
  oauthToken,
  organization,
  user,
} from "@repo/database";
import { and, eq, isNull } from "drizzle-orm";
import { isFirstPartyApp } from "./access";
import {
  type AuthorizedAppView,
  groupAuthorizedApps,
} from "./authorized-group";

/** The apps that can still use `userId`'s account, newest activity first. */
export async function listAuthorizedApps(
  userId: string,
  now = new Date(),
): Promise<AuthorizedAppView[]> {
  const rows = await db
    .select({
      appId: oauthApp.id,
      name: oauthApp.name,
      logoUrl: oauthApp.logoUrl,
      websiteUrl: oauthApp.websiteUrl,
      verified: oauthApp.verified,
      ownerUserId: oauthApp.ownerUserId,
      organizationId: oauthApp.organizationId,
      appActive: oauthApp.isActive,
      teamName: organization.name,
      ownerName: user.name,
      scopes: oauthToken.scopes,
      createdAt: oauthToken.createdAt,
      updatedAt: oauthToken.updatedAt,
      accessTokenExpiresAt: oauthToken.accessTokenExpiresAt,
      refreshTokenExpiresAt: oauthToken.refreshTokenExpiresAt,
    })
    .from(oauthToken)
    .innerJoin(oauthApp, eq(oauthApp.id, oauthToken.appId))
    .leftJoin(organization, eq(organization.id, oauthApp.organizationId))
    .leftJoin(user, eq(user.id, oauthApp.ownerUserId))
    .where(and(eq(oauthToken.userId, userId), isNull(oauthToken.revokedAt)));

  return groupAuthorizedApps(
    rows.map((row) => {
      const firstParty = isFirstPartyApp(row);
      return {
        ...row,
        firstParty,
        builtBy: firstParty
          ? "QRdx"
          : (row.teamName ?? row.ownerName ?? "an independent developer"),
      };
    }),
    now,
  );
}

/**
 * Takes `appId`'s access to `userId`'s account away: every token it holds is
 * revoked (API calls get 401 `invalid_token` at once, refreshes fail) and any
 * authorization code not yet exchanged is spent, so it can't be turned into
 * a new token. Using the app again shows the consent screen. Returns the
 * number of tokens revoked (0 when there was nothing to revoke).
 */
export async function revokeAuthorizedApp(
  userId: string,
  appId: string,
): Promise<number> {
  const now = new Date();
  const revoked = await db
    .update(oauthToken)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(oauthToken.userId, userId),
        eq(oauthToken.appId, appId),
        isNull(oauthToken.revokedAt),
      ),
    )
    .returning({ id: oauthToken.id });

  await db
    .update(oauthAuthorizationCode)
    .set({ usedAt: now })
    .where(
      and(
        eq(oauthAuthorizationCode.userId, userId),
        eq(oauthAuthorizationCode.appId, appId),
        isNull(oauthAuthorizationCode.usedAt),
      ),
    );

  return revoked.length;
}
