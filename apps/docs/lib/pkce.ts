import crypto from "node:crypto";

/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0
 */

/**
 * Generate a cryptographically random code verifier
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate a code challenge from a code verifier using SHA256
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Generate both verifier and challenge for PKCE flow
 */
export function generatePKCE() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256" as const,
  };
}





