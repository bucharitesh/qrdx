import type { passkey } from "@better-auth/passkey";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import type { PasskeyRelyingParty } from "./passkey-rp";

// Passkeys (packages/database/manual-sql/0017). Every passkey is a
// discoverable credential that verifies the person (PIN, fingerprint or
// face) each time it's used, so a passkey sign-in counts as two factors and
// skips the two-step verification challenge. The plugin only *prefers* user
// verification when signing in; QRdx requires it, and refuses an assertion
// without it before any session exists (refuseWithoutUserVerification).

/** Signs in with a passkey; the only passkey path that creates a session. */
export const PASSKEY_SIGN_IN_PATH = "/passkey/verify-authentication";
/** The challenge for a passkey sign-in (button and autofill). */
export const PASSKEY_SIGN_IN_OPTIONS_PATH =
  "/passkey/generate-authenticate-options";

// Adding, renaming and removing passkeys only happen through the app's server
// actions (apps/docs/app/settings/account/_lib/passkey-actions.ts), which add
// a recent sign-in and the notice email, so these are off over HTTP.
export const SERVER_ONLY_PASSKEY_PATHS = [
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/update-passkey",
  "/passkey/delete-passkey",
];

export const USER_VERIFICATION_REQUIRED = {
  code: "PASSKEY_USER_VERIFICATION_REQUIRED",
  message:
    "This passkey didn't ask for your PIN, fingerprint or face. Use one that does.",
} as const;

// Where the deployment's URL can't carry passkeys (passkey-rp.ts), a host
// that can't exist (RFC 2606): every ceremony fails, never falls back to the
// request's Origin header, and the app hides passkeys anyway.
const UNAVAILABLE_HOST = "passkeys-unavailable.invalid";

type PasskeyOptions = NonNullable<Parameters<typeof passkey>[0]>;

/** Throws when the authenticator didn't verify the person. */
export function refuseWithoutUserVerification(userVerified: boolean): void {
  if (!userVerified) {
    throw new APIError("UNAUTHORIZED", { ...USER_VERIFICATION_REQUIRED });
  }
}

export function passkeyOptions(
  relyingParty: PasskeyRelyingParty | null
): PasskeyOptions {
  return {
    rpName: "QRdx",
    rpID: relyingParty?.rpID ?? UNAVAILABLE_HOST,
    origin: relyingParty?.origin ?? `https://${UNAVAILABLE_HOST}`,
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    registration: {
      afterVerification: ({ verification }) => {
        refuseWithoutUserVerification(
          verification.registrationInfo?.userVerified === true
        );
      },
    },
    authentication: {
      // Runs after the signature checks out and before the session is made.
      afterVerification: ({ verification }) => {
        refuseWithoutUserVerification(
          verification.authenticationInfo.userVerified
        );
      },
    },
  };
}

/** Sign-in options as the plugin returns them, with user verification required. */
export function requireUserVerification<T extends object>(
  options: T
): T & { userVerification: "required" } {
  return { ...options, userVerification: "required" };
}

/**
 * What the plugin's options don't cover: sign-in options ask the browser for
 * user verification (the plugin hard-codes "preferred"; the server check
 * above is what enforces it), and adding a passkey never signs anyone in
 * (`createSession`), so passkey sign-ins only happen through
 * PASSKEY_SIGN_IN_PATH.
 */
export const passkeyPolicy = () =>
  ({
    id: "qrdx-passkey-policy",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/passkey/verify-registration",
          handler: createAuthMiddleware((ctx) => {
            if (ctx.body?.createSession) {
              throw new APIError("BAD_REQUEST", {
                message: "Adding a passkey doesn't sign in.",
              });
            }
            return Promise.resolve();
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === PASSKEY_SIGN_IN_OPTIONS_PATH,
          handler: createAuthMiddleware((ctx): Promise<unknown> => {
            const returned = ctx.context.returned;
            if (
              !returned ||
              typeof returned !== "object" ||
              returned instanceof Response ||
              returned instanceof Error ||
              !("challenge" in returned)
            ) {
              return Promise.resolve();
            }
            return Promise.resolve(ctx.json(requireUserVerification(returned)));
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

export interface CookieToSet {
  name: string;
  value: string;
  options: ReturnType<typeof toCookieOptions>;
}

/**
 * The cookies an auth.api call set (call it with `returnHeaders: true`), for
 * a server action to pass on with next/headers `cookies().set`. Adding a
 * passkey needs this: its challenge lives in a signed cookie between the two
 * steps.
 */
export function cookiesToSet(headers: Headers): CookieToSet[] {
  const header = headers.get("set-cookie");
  if (!header) return [];
  return [...parseSetCookieHeader(header)].map(([name, attributes]) => ({
    name,
    value: attributes.value,
    options: toCookieOptions(attributes),
  }));
}

/** "Google Password Manager", "iCloud Keychain (Managed)", … when known. */
export { getAuthenticatorName } from "@better-auth/passkey";
