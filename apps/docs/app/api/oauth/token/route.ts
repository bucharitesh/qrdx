import {
  database as db,
  oauthAuthorizationCode,
  oauthToken,
} from "@repo/database";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import {
  authenticateClient,
  createTokenPair,
  hashToken,
  oauthError,
  verifyCodeChallenge,
} from "@/lib/oauth";

export async function POST(req: NextRequest) {
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

  const [authCode] = await db
    .select({
      id: oauthAuthorizationCode.id,
      expiresAt: oauthAuthorizationCode.expiresAt,
      redirectUri: oauthAuthorizationCode.redirectUri,
      codeChallenge: oauthAuthorizationCode.codeChallenge,
      codeChallengeMethod: oauthAuthorizationCode.codeChallengeMethod,
      userId: oauthAuthorizationCode.userId,
      scopes: oauthAuthorizationCode.scopes,
    })
    .from(oauthAuthorizationCode)
    .where(
      and(
        eq(oauthAuthorizationCode.code, code),
        eq(oauthAuthorizationCode.appId, app.id),
        isNull(oauthAuthorizationCode.usedAt),
      ),
    )
    .limit(1);

  if (!authCode) {
    return oauthError(
      "invalid_grant",
      "Invalid or already used authorization code",
    );
  }

  if (new Date() > authCode.expiresAt) {
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
  }

  await db
    .update(oauthAuthorizationCode)
    .set({ usedAt: new Date() })
    .where(eq(oauthAuthorizationCode.id, authCode.id));

  const tokenResponse = await createTokenPair(
    app.id,
    authCode.userId,
    authCode.scopes,
  );

  return Response.json(tokenResponse);
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

  const refreshTokenHash = hashToken(refreshToken);
  const [tokenRecord] = await db
    .select({
      id: oauthToken.id,
      userId: oauthToken.userId,
      scopes: oauthToken.scopes,
      refreshTokenExpiresAt: oauthToken.refreshTokenExpiresAt,
    })
    .from(oauthToken)
    .where(
      and(
        eq(oauthToken.refreshTokenHash, refreshTokenHash),
        eq(oauthToken.appId, app.id),
        isNull(oauthToken.revokedAt),
      ),
    )
    .limit(1);

  if (!tokenRecord) {
    return oauthError("invalid_grant", "Invalid refresh token");
  }

  if (
    tokenRecord.refreshTokenExpiresAt &&
    new Date() > tokenRecord.refreshTokenExpiresAt
  ) {
    return oauthError("invalid_grant", "Refresh token expired");
  }

  await db
    .update(oauthToken)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(oauthToken.id, tokenRecord.id));

  const tokenResponse = await createTokenPair(
    app.id,
    tokenRecord.userId,
    tokenRecord.scopes,
  );

  return Response.json(tokenResponse);
}
