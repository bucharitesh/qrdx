import {
  isPasskeyOrigin,
  type PasskeyRelyingParty,
  passkeyRelyingParty,
} from "@repo/auth/passkey-rp";

/**
 * Where passkeys can be offered. The deployment's URL decides whether they
 * work at all (the "passkeys" feature, packages/availability/rules.ts);
 * the page's own origin decides whether they work on this page, since a
 * passkey only signs in on the origin it belongs to (a preview deployment's
 * URL isn't qrdx.dev). Client-safe: NEXT_PUBLIC_APP_URL is inlined at build,
 * and the feature rule already requires BETTER_AUTH_URL to agree with it.
 */
export function appRelyingParty(): PasskeyRelyingParty | null {
  return passkeyRelyingParty({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export function passkeysWorkOn(
  origin: string | null | undefined,
  relyingParty: PasskeyRelyingParty | null = appRelyingParty(),
): boolean {
  return isPasskeyOrigin(relyingParty, origin);
}

/** WebAuthn in this browser (client only; false on the server). */
export function browserHasPasskeys(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}
