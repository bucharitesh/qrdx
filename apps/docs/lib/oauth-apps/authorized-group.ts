import {
  isOAuthScope,
  OAUTH_SCOPES,
  type OAuthScope,
} from "@/lib/oauth-scopes";

/**
 * Settings → Authorized apps: the third-party (and QRdx) apps a user has let
 * into their account, one entry per app. Pure, so it's tested without a DB;
 * lib/oauth-apps/authorized.ts feeds it the user's non-revoked tokens.
 */

/** One non-revoked token of the user, with its app. */
export interface AuthorizationRow {
  appId: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  verified: boolean;
  firstParty: boolean;
  builtBy: string;
  appActive: boolean;
  scopes: unknown;
  createdAt: Date;
  updatedAt: Date;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
}

export interface AuthorizedAppView {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  builtBy: string;
  firstParty: boolean;
  verified: boolean;
  /** The app is paused by its developer: it can't call the API right now. */
  paused: boolean;
  /** Everything the app may do, in the order the consent screen lists it. */
  scopes: OAuthScope[];
  /** ISO dates: first authorization and most recent token activity. */
  authorizedAt: string;
  lastActiveAt: string;
}

/**
 * A token still grants access while its refresh token is valid, or, when it
 * has none, while its access token is.
 */
export function isLiveGrant(row: AuthorizationRow, now: Date): boolean {
  return row.refreshTokenExpiresAt
    ? row.refreshTokenExpiresAt > now
    : row.accessTokenExpiresAt > now;
}

export function groupAuthorizedApps(
  rows: readonly AuthorizationRow[],
  now: Date,
): AuthorizedAppView[] {
  const byApp = new Map<
    string,
    {
      view: AuthorizedAppView;
      scopes: Set<OAuthScope>;
      first: Date;
      last: Date;
    }
  >();

  for (const row of rows) {
    if (!isLiveGrant(row, now)) continue;
    const scopes = Array.isArray(row.scopes)
      ? row.scopes.filter(
          (scope): scope is OAuthScope =>
            typeof scope === "string" && isOAuthScope(scope),
        )
      : [];
    const active =
      row.updatedAt > row.createdAt ? row.updatedAt : row.createdAt;
    const entry = byApp.get(row.appId);
    if (entry) {
      for (const scope of scopes) entry.scopes.add(scope);
      if (row.createdAt < entry.first) entry.first = row.createdAt;
      if (active > entry.last) entry.last = active;
      continue;
    }
    byApp.set(row.appId, {
      view: {
        id: row.appId,
        name: row.name,
        logoUrl: row.logoUrl,
        websiteUrl: row.websiteUrl,
        builtBy: row.builtBy,
        firstParty: row.firstParty,
        verified: row.verified,
        paused: !row.appActive,
        scopes: [],
        authorizedAt: "",
        lastActiveAt: "",
      },
      scopes: new Set(scopes),
      first: row.createdAt,
      last: active,
    });
  }

  return [...byApp.values()]
    .map(({ view, scopes, first, last }) => ({
      ...view,
      scopes: OAUTH_SCOPES.filter((scope) => scopes.has(scope)),
      authorizedAt: first.toISOString(),
      lastActiveAt: last.toISOString(),
    }))
    .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}
