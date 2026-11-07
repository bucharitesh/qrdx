/**
 * Two-step verification's methods: passkeys and an authenticator app, with
 * backup codes for when neither is at hand. Pure and client-safe; the
 * server side is ./two-factor-server.ts and ./two-factor-manage.ts.
 *
 * Either method turns two-step verification on, and both can be set up. The
 * switch is `user.two_factor_enabled`; the `two_factor` row (Better Auth's
 * twoFactor plugin) holds the backup codes, the attempts counter and, when
 * there is one, the authenticator app's secret. No schema change: an
 * account whose only method is passkeys keeps a row with no usable secret,
 * marked `verified = false`, so every TOTP path refuses it:
 *
 * - the plugin's own sign-in check (/two-factor/verify-totp without a
 *   session) answers TOTP_NOT_ENABLED for `verified = false` before looking
 *   at the code;
 * - the app's checks (./confirmation-server.ts, ./two-factor-manage.ts)
 *   test hasAuthenticatorApp() before calling the plugin;
 * - the secret is blanked (NO_AUTHENTICATOR_SECRET), so even a check that
 *   got past both has nothing to compare a code with.
 *
 * Existing authenticator rows (`verified` true, or null from before the
 * column) keep working unchanged.
 */

/** The `secret` of a row that holds backup codes but no authenticator app. */
export const NO_AUTHENTICATOR_SECRET = "";

/** The parts of a `two_factor` row that say whether an app is set up. */
export interface TwoFactorRowFacts {
  verified: boolean | null;
  secret: string;
}

/**
 * An authenticator app is set up and confirmed: the plugin's own rule
 * (`verified !== false`), and a secret to check codes against.
 */
export function hasAuthenticatorApp(
  row: TwoFactorRowFacts | null | undefined,
): boolean {
  return Boolean(
    row && row.verified !== false && row.secret !== NO_AUTHENTICATOR_SECRET,
  );
}

/** A setup was started (a secret was made) but not confirmed with a code. */
export function authenticatorSetupStarted(
  row: TwoFactorRowFacts | null | undefined,
): boolean {
  return Boolean(
    row && row.verified === false && row.secret !== NO_AUTHENTICATOR_SECRET,
  );
}

export interface TwoFactorMethods {
  /** The switch: signing in asks for a second step */
  on: boolean;
  /** An authenticator app is set up */
  authenticatorApp: boolean;
  /** Passkeys on the account (each one also signs in on its own) */
  passkeys: number;
  /** Unused backup codes; null when off or they couldn't be read */
  backupCodesLeft: number | null;
}

/**
 * Removing this method leaves two-step verification without one, so it
 * turns off (the dialog says so first).
 */
export function removalTurnsOff(
  methods: Pick<TwoFactorMethods, "on" | "authenticatorApp" | "passkeys">,
  removing: "authenticator" | "passkey",
): boolean {
  if (!methods.on) return false;
  const passkeysLeft =
    removing === "passkey" ? methods.passkeys - 1 : methods.passkeys;
  const appLeft =
    removing === "authenticator" ? false : methods.authenticatorApp;
  return passkeysLeft <= 0 && !appLeft;
}

/** Off, but a passkey could be the second step: "Turn on" offers it. */
export function passkeyReadyForTwoFactor(
  methods: Pick<TwoFactorMethods, "on" | "passkeys">,
): boolean {
  return !methods.on && methods.passkeys > 0;
}
