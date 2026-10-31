import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createOAuthHandler,
  generateCodeVerifier,
  getIntegrationConfigWithEnv,
  getIntegrationRegistry,
} from "@repo/integrations";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10; // 10 minutes

const canEncryptTokens = () =>
  !(env.NODE_ENV === "production" && !env.INTEGRATION_ENCRYPTION_KEY);

/**
 * True when the integration can be connected: its OAuth credentials are set
 * (or people connect with their own API key) and, in production, stored
 * tokens can be encrypted (INTEGRATION_ENCRYPTION_KEY).
 */
export function isIntegrationConfigured(provider: string): boolean {
  if (!canEncryptTokens()) {
    return false;
  }

  try {
    getIntegrationConfigWithEnv(provider, env);
    return true;
  } catch {
    // An API-key fallback (Bitly's access token) works without app credentials
    return Boolean(getIntegrationRegistry().get(provider)?.apiKey);
  }
}

/** True when the OAuth sign-in flow itself can start for this provider. */
export function isOAuthConfigured(provider: string): boolean {
  const definition = getIntegrationRegistry().get(provider);
  if (
    !(definition?.oauth && definition.type === "oauth" && canEncryptTokens())
  ) {
    return false;
  }

  try {
    getIntegrationConfigWithEnv(provider, env);
    return true;
  } catch {
    return false;
  }
}

const verifierCookieName = (provider: string) => `${provider}_code_verifier`;
const stateCookieName = (provider: string) => `${provider}_oauth_state`;

/**
 * Starts an integration OAuth flow: stores the PKCE verifier and a random
 * `state` in httpOnly cookies and returns the provider authorization URL.
 */
export async function createIntegrationAuthUrl(
  provider: string,
): Promise<string> {
  const config = getIntegrationConfigWithEnv(provider, env);
  const codeVerifier = generateCodeVerifier();
  const state = randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  };
  cookieStore.set(verifierCookieName(provider), codeVerifier, cookieOptions);
  cookieStore.set(stateCookieName(provider), state, cookieOptions);

  return createOAuthHandler(config).generateAuthUrl(codeVerifier, state);
}

/**
 * Reads (and clears) the flow cookies on callback, rejecting a missing or
 * mismatched `state` (login CSRF / code injection).
 */
export async function consumeIntegrationOAuthState(
  provider: string,
  state: string | null,
): Promise<
  { codeVerifier: string } | { error: "missing_verifier" | "invalid_state" }
> {
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get(verifierCookieName(provider))?.value;
  const expectedState = cookieStore.get(stateCookieName(provider))?.value;

  cookieStore.delete(verifierCookieName(provider));
  cookieStore.delete(stateCookieName(provider));

  if (!codeVerifier) {
    return { error: "missing_verifier" };
  }

  if (!state || !expectedState) {
    return { error: "invalid_state" };
  }

  const received = Buffer.from(state);
  const expected = Buffer.from(expectedState);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return { error: "invalid_state" };
  }

  return { codeVerifier };
}
