import {
  database as db,
  oauthApp,
  oauthAuthorizationCode,
  oauthToken,
} from "@repo/database";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import cuid from "cuid";
import {
  OAUTH_ACCESS_TOKEN_EXPIRY_SECONDS,
  OAUTH_REFRESH_TOKEN_EXPIRY_SECONDS,
} from "@/lib/constants";

export const OAUTH_SCOPES = ["themes:read", "profile:read"] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export function oauthError(
  error: string,
  description: string,
  status = 400,
): Response {
  return Response.json({ error, error_description: description }, { status });
}

export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 12);
}

export async function verifySecret(
  secret: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

export function validateRedirectUri(
  uri: string,
  registeredUris: string[],
): boolean {
  return registeredUris.includes(uri);
}

export function parseScopes(scopeParam: string): string[] {
  return scopeParam.split(/[\s,]+/).filter(Boolean);
}

export function validateScopes(scopes: string[]): boolean {
  return (
    scopes.length > 0 &&
    scopes.every((s) => OAUTH_SCOPES.includes(s as OAuthScope))
  );
}

export function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (method === "S256") {
    const hash = createHash("sha256").update(verifier).digest("base64url");
    return hash === challenge;
  }
  if (method === "plain") {
    return verifier === challenge;
  }
  return false;
}

export async function authenticateClient(
  clientId: string,
  clientSecret: string,
): Promise<{ id: string } | null> {
  const [app] = await db
    .select({ id: oauthApp.id, clientSecretHash: oauthApp.clientSecretHash })
    .from(oauthApp)
    .where(and(eq(oauthApp.clientId, clientId), eq(oauthApp.isActive, true)))
    .limit(1);

  if (!app) return null;

  const valid = await verifySecret(clientSecret, app.clientSecretHash);
  if (!valid) return null;

  return { id: app.id };
}

export async function createTokenPair(
  appId: string,
  userId: string,
  scopes: string[],
) {
  const accessToken = generateSecureToken();
  const refreshToken = generateSecureToken();
  const now = new Date();

  await db.insert(oauthToken).values({
    id: cuid(),
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    appId,
    userId,
    scopes,
    accessTokenExpiresAt: new Date(
      now.getTime() + OAUTH_ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
    ),
    refreshTokenExpiresAt: new Date(
      now.getTime() + OAUTH_REFRESH_TOKEN_EXPIRY_SECONDS * 1000,
    ),
    createdAt: now,
    updatedAt: now,
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: OAUTH_ACCESS_TOKEN_EXPIRY_SECONDS,
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  };
}

export async function validateAccessToken(token: string) {
  const tokenHash = hashToken(token);
  const now = new Date();

  const [record] = await db
    .select({
      userId: oauthToken.userId,
      scopes: oauthToken.scopes,
      accessTokenExpiresAt: oauthToken.accessTokenExpiresAt,
    })
    .from(oauthToken)
    .where(
      and(
        eq(oauthToken.accessTokenHash, tokenHash),
        isNull(oauthToken.revokedAt),
      ),
    )
    .limit(1);

  if (!record) return null;
  if (now > record.accessTokenExpiresAt) return null;

  return record;
}

export async function requireAuth(req: NextRequest, requiredScope: OAuthScope) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: oauthError(
        "invalid_token",
        "Missing or invalid Authorization header",
        401,
      ),
    };
  }

  const token = authHeader.slice(7);
  const tokenData = await validateAccessToken(token);

  if (!tokenData) {
    return { error: oauthError("invalid_token", "Invalid or expired token", 401) };
  }

  if (!tokenData.scopes.includes(requiredScope)) {
    return {
      error: oauthError(
        "insufficient_scope",
        `Scope '${requiredScope}' required`,
        403,
      ),
    };
  }

  return { tokenData };
}
