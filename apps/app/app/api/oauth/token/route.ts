import {
  database as db,
  oauthAuthorizationCode,
  oauthToken,
  user,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import {
  authenticateClient,
  createTokenPair,
  hashToken,
  isBanActive,
  isUserBanned,
  NO_STORE_HEADERS,
  oauthError,
  verifyCodeChallenge,
} from "@/lib/oauth";
import { getClientIp } from "@/lib/request-guards";

// bcrypt client-secret checks are CPU-heavy: cap attempts per IP.
const tokenRateLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

export async function POST(req: NextRequest) {
  const { success } = await tokenRateLimiter.limit(
    `oauth-token:ip:${getClientIp(req)}`,
  );
  if (!success) {
    return oauthError(
      "temporarily_unavailable",
      "Too many requests. Please try again later.",
      429,
    );
  }

  const body = await req.formData().catch(() => null);
  if (!body) {
    return oauthError("invalid_request", "Request body must be form-encoded");
  }

  const grantType = body.get("grant_type") as string | null;

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(body);
  }

  if (grantType === "refresh_token") {
    return handleRefreshToken(body);
  }

  return oauthError(
    "unsupported_grant_type",
    "Supported: authorization_code, refresh_token",
  );
}

async function handleAuthorizationCode(body: FormData) {
  const clientId = body.get("client_id") as string | null;
  const clientSecret = body.get("client_secret") as string | null;
  const code = body.get("code") as string | null;
  const redirectUri = body.get("redirect_uri") as string | null;
  const codeVerifier = body.get("code_verifier") as string | null;

  if (!clientId || !clientSecret || !code || !redirectUri) {
    return oauthError(
      "invalid_request",
      "Missing required parameters: client_id, client_secret, code, redirect_uri",
    );
  }

  const app = await authenticateClient(clientId, clientSecret);
  if (!app) {
    return oauthError("invalid_client", "Invalid client credentials", 401);
  }

  const now = new Date();

  // Consume the code atomically: concurrent exchanges of one code can't both win.
  const [authCode] = await db
    .update(oauthAuthorizationCode)
    .set({ usedAt: now })
    .where(
      and(
        eq(oauthAuthorizationCode.code, hashToken(code)),
        eq(oauthAuthorizationCode.appId, app.id),
        isNull(oauthAuthorizationCode.usedAt),
      ),
    )
    .returning({
      expiresAt: oauthAuthorizationCode.expiresAt,
      redirectUri: oauthAuthorizationCode.redirectUri,
      codeChallenge: oauthAuthorizationCode.codeChallenge,
      codeChallengeMethod: oauthAuthorizationCode.codeChallengeMethod,
      userId: oauthAuthorizationCode.userId,
      scopes: oauthAuthorizationCode.scopes,
    });

  if (!authCode) {
    return oauthError(
      "invalid_grant",
      "Invalid or already used authorization code",
    );
  }

  if (now > authCode.expiresAt) {
    return oauthError("invalid_grant", "Authorization code expired");
  }

  if (authCode.redirectUri !== redirectUri) {
    return oauthError("invalid_grant", "redirect_uri mismatch");
  }

  if (authCode.codeChallenge) {
    if (!codeVerifier) {
      return oauthError("invalid_request", "code_verifier required for PKCE");
    }
    if (
      !verifyCodeChallenge(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod ?? "S256",
      )
    ) {
      return oauthError("invalid_grant", "PKCE verification failed");
    }
  } else if (codeVerifier) {
    // PKCE downgrade: a verifier for a code issued without a challenge
    return oauthError(
      "invalid_grant",
      "code_verifier sent for a code issued without code_challenge",
    );
  }

  if (await isUserBanned(authCode.userId)) {
    return oauthError("invalid_grant", "This account is suspended");
  }

  const tokenResponse = await createTokenPair(
    app.id,
    authCode.userId,
    authCode.scopes,
  );

  return Response.json(tokenResponse, { headers: NO_STORE_HEADERS });
}

async function handleRefreshToken(body: FormData) {
  const clientId = body.get("client_id") as string | null;
  const clientSecret = body.get("client_secret") as string | null;
  const refreshToken = body.get("refresh_token") as string | null;

  if (!clientId || !clientSecret || !refreshToken) {
    return oauthError(
      "invalid_request",
      "Missing required parameters: client_id, client_secret, refresh_token",
    );
  }

  const app = await authenticateClient(clientId, clientSecret);
  if (!app) {
    return oauthError("invalid_client", "Invalid client credentials", 401);
  }

  const now = new Date();
  const refreshTokenHash = hashToken(refreshToken);

  // Banned accounts can't refresh. Checked before rotating, so the grant
  // works again if a temporary ban ends.
  const [owner] = await db
    .select({ banned: user.banned, banExpires: user.banExpires })
    .from(oauthToken)
    .innerJoin(user, eq(user.id, oauthToken.userId))
    .where(
      and(
        eq(oauthToken.refreshTokenHash, refreshTokenHash),
        eq(oauthToken.appId, app.id),
        isNull(oauthToken.revokedAt),
      ),
    )
    .limit(1);
  if (owner && isBanActive(owner, now)) {
    return oauthError("invalid_grant", "This account is suspended");
  }

  // Rotate atomically: a refresh token can be redeemed exactly once.
  const [tokenRecord] = await db
    .update(oauthToken)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(oauthToken.refreshTokenHash, refreshTokenHash),
        eq(oauthToken.appId, app.id),
        isNull(oauthToken.revokedAt),
      ),
    )
    .returning({
      userId: oauthToken.userId,
      scopes: oauthToken.scopes,
      refreshTokenExpiresAt: oauthToken.refreshTokenExpiresAt,
    });

  if (!tokenRecord) {
    return oauthError("invalid_grant", "Invalid refresh token");
  }

  if (
    tokenRecord.refreshTokenExpiresAt &&
    now > tokenRecord.refreshTokenExpiresAt
  ) {
    return oauthError("invalid_grant", "Refresh token expired");
  }

  const tokenResponse = await createTokenPair(
    app.id,
    tokenRecord.userId,
    tokenRecord.scopes,
  );

  return Response.json(tokenResponse, { headers: NO_STORE_HEADERS });
}
