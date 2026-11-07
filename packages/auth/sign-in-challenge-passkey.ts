import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { GenericEndpointContext } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import * as z from "zod";
import { USER_VERIFICATION_REQUIRED } from "./passkey";
import type { PasskeyRelyingParty } from "./passkey-rp";
import {
  CHALLENGE_ATTEMPTS,
  LOCKOUT_FAILURES,
  LOCKOUT_MINUTES,
  PASSKEY_STEP_OPTIONS_PATH,
  PASSKEY_STEP_SECONDS,
  PASSKEY_STEP_VERIFY_PATH,
  passkeyAssertionUserVerified,
  TWO_FACTOR_METHODS_PATH,
  type TwoFactorMethods,
  totpIsSetUp,
} from "./sign-in-challenge-rules";
import {
  beginChallengeAttempt,
  CHALLENGE_ERRORS,
  type ChallengeContext,
  finishChallenge,
  type PendingChallenge,
  requirePendingChallenge,
} from "./sign-in-challenge-session";

// A passkey as the second step of signing in (two-step verification on, at
// least one passkey). The first step (an email code, Google, GitHub, SSO)
// left a pending challenge; these endpoints let its person finish it with
// one of their own passkeys, instead of an authenticator or backup code:
//
// - GET  /two-factor/methods: which second steps they have set up;
// - POST /two-factor/passkey/options: WebAuthn request options for their
//   passkeys only, user verification required. The WebAuthn challenge is
//   kept server-side, bound to the pending challenge, for 5 minutes, once;
// - POST /two-factor/passkey/verify: checks the assertion against their
//   stored passkeys (RP ID and origin from ./passkey-rp.ts, user
//   verification required), counts it against the challenge's attempts and
//   the account lockout like a code, and on success finishes the challenge
//   exactly like a right TOTP code (./sign-in-challenge-session.ts).
//
// All three need the pending challenge (the two_factor cookie); the verify
// endpoint, like the code endpoints, refuses a browser that is already
// signed in (./sign-in-challenge.ts).

const TWO_FACTOR_TABLE = "twoFactor";
const PASSKEY_TABLE = "passkey";

export const PASSKEY_STEP_ERRORS = {
  /** No passkey for this person, or passkeys don't work on this server. */
  UNAVAILABLE: {
    code: "PASSKEY_STEP_UNAVAILABLE",
    message: "There's no passkey to use for this account here.",
  },
  /** The WebAuthn challenge expired, was used, or never existed. */
  CHALLENGE_NOT_FOUND: {
    code: "PASSKEY_CHALLENGE_NOT_FOUND",
    message: "The passkey prompt timed out. Try again.",
  },
  /** Not one of this person's passkeys, or the signature didn't check out. */
  INVALID_PASSKEY: {
    code: "INVALID_PASSKEY",
    message: "Couldn't verify your passkey.",
  },
  USER_VERIFICATION_REQUIRED,
} as const;

interface TwoFactorRow {
  id: string;
  secret?: string | null;
  backupCodes?: string | null;
  verified?: boolean | null;
  failedVerificationCount?: number | null;
  lockedUntil?: Date | string | null;
}

interface PasskeyRow {
  id: string;
  credentialID: string;
  publicKey: string;
  counter: number;
  transports?: string | null;
}

/** A stored public key (standard base64, as the passkey plugin saves it). */
function base64Bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/** The WebAuthn challenge's record, keyed by the pending challenge. */
const stepIdentifier = (pending: PendingChallenge) =>
  `2fa-passkey-${pending.id}`;

function twoFactorRow(
  ctx: ChallengeContext,
  userId: string
): Promise<TwoFactorRow | null> {
  return ctx.context.adapter.findOne<TwoFactorRow>({
    model: TWO_FACTOR_TABLE,
    where: [{ field: "userId", value: userId }],
  });
}

function userPasskeys(
  ctx: ChallengeContext,
  userId: string
): Promise<PasskeyRow[]> {
  return ctx.context.adapter.findMany<PasskeyRow>({
    model: PASSKEY_TABLE,
    where: [{ field: "userId", value: userId }],
  });
}

/**
 * Whether any backup code is left. Stored encrypted (server.ts); a row that
 * can't be read counts as having some, so nobody loses the option to try.
 */
async function hasBackupCodes(
  ctx: ChallengeContext,
  row: TwoFactorRow | null
): Promise<boolean> {
  if (!row?.backupCodes) return false;
  const plugin = ctx.context.getPlugin("two-factor") as {
    options?: { backupCodeOptions?: { storeBackupCodes?: unknown } };
  } | null;
  const storage = plugin?.options?.backupCodeOptions?.storeBackupCodes;
  try {
    const json =
      storage === "encrypted"
        ? await symmetricDecrypt({
            key: ctx.context.secretConfig,
            data: row.backupCodes,
          })
        : storage === undefined || storage === "plain"
          ? row.backupCodes
          : null;
    if (json === null) return true;
    const codes: unknown = JSON.parse(json);
    return Array.isArray(codes) && codes.length > 0;
  } catch (error) {
    ctx.context.logger.error(
      "Couldn't read backup codes for the second step",
      error
    );
    return true;
  }
}

/** Which second steps the pending person has set up. */
export async function twoFactorMethodsFor(
  ctx: ChallengeContext,
  userId: string,
  relyingParty: PasskeyRelyingParty | null
): Promise<TwoFactorMethods> {
  const [row, passkeys] = await Promise.all([
    twoFactorRow(ctx, userId),
    relyingParty ? userPasskeys(ctx, userId) : Promise.resolve([]),
  ]);
  return {
    passkey: passkeys.length > 0,
    totp: totpIsSetUp(row),
    backupCodes: await hasBackupCodes(ctx, row),
  };
}

// ─── The account lockout ────────────────────────────────────────────────────
// The same counter, columns and limits as a wrong code at sign-in (the
// twoFactor plugin's assertTwoFactorNotLocked / recordTwoFactorFailure /
// resetTwoFactorFailures, and the app's reserveCodeAttempt): consecutive
// failures across challenges and methods, LOCKOUT_FAILURES of them lock the
// account's second step for LOCKOUT_MINUTES.

function lockoutConfig(ctx: ChallengeContext) {
  const plugin = ctx.context.getPlugin("two-factor") as {
    options?: {
      accountLockout?: {
        enabled?: boolean;
        maxFailedAttempts?: number;
        durationSeconds?: number;
      };
    };
  } | null;
  const lockout = plugin?.options?.accountLockout;
  return {
    enabled: lockout?.enabled ?? true,
    maxFailedAttempts: lockout?.maxFailedAttempts ?? LOCKOUT_FAILURES,
    durationMs: (lockout?.durationSeconds ?? LOCKOUT_MINUTES * 60) * 1000,
  };
}

async function assertNotLocked(
  ctx: ChallengeContext,
  row: TwoFactorRow | null
): Promise<void> {
  if (!(row?.lockedUntil && lockoutConfig(ctx).enabled)) return;
  if (new Date(row.lockedUntil).getTime() > Date.now()) {
    throw new APIError("TOO_MANY_REQUESTS", {
      ...CHALLENGE_ERRORS.ACCOUNT_TEMPORARILY_LOCKED,
    });
  }
  // An expired lock: the count starts again.
  await ctx.context.adapter.incrementOne({
    model: TWO_FACTOR_TABLE,
    where: [
      { field: "id", value: row.id },
      { field: "lockedUntil", operator: "lte", value: new Date() },
    ],
    increment: {},
    set: { failedVerificationCount: 0, lockedUntil: null },
  });
}

async function recordAccountFailure(
  ctx: ChallengeContext,
  row: TwoFactorRow | null
): Promise<void> {
  const { enabled, maxFailedAttempts, durationMs } = lockoutConfig(ctx);
  if (!(row && enabled)) return;
  const updated = await ctx.context.adapter.incrementOne<TwoFactorRow>({
    model: TWO_FACTOR_TABLE,
    where: [{ field: "id", value: row.id }],
    increment: { failedVerificationCount: 1 },
  });
  if ((updated?.failedVerificationCount ?? 0) >= maxFailedAttempts) {
    await ctx.context.adapter.incrementOne({
      model: TWO_FACTOR_TABLE,
      where: [
        { field: "id", value: row.id },
        {
          field: "failedVerificationCount",
          operator: "gte",
          value: maxFailedAttempts,
        },
      ],
      increment: {},
      set: { lockedUntil: new Date(Date.now() + durationMs) },
    });
  }
}

async function resetAccountFailures(
  ctx: ChallengeContext,
  row: TwoFactorRow | null
): Promise<void> {
  if (!(row && lockoutConfig(ctx).enabled)) return;
  await ctx.context.adapter.update({
    model: TWO_FACTOR_TABLE,
    where: [{ field: "id", value: row.id }],
    update: { failedVerificationCount: 0, lockedUntil: null },
  });
}

// ─── The endpoints ──────────────────────────────────────────────────────────

const verifyBody = z.object({
  response: z.looseObject({ id: z.string().min(1) }),
  trustDevice: z.boolean().optional(),
});

function unavailable() {
  return new APIError("BAD_REQUEST", { ...PASSKEY_STEP_ERRORS.UNAVAILABLE });
}

async function passkeyOptions(
  ctx: GenericEndpointContext,
  relyingParty: PasskeyRelyingParty | null
) {
  const pending = await requirePendingChallenge(ctx);
  if (!relyingParty) throw unavailable();
  const passkeys = await userPasskeys(ctx, pending.userId);
  if (!passkeys.length) throw unavailable();

  const options = await generateAuthenticationOptions({
    rpID: relyingParty.rpID,
    userVerification: "required",
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialID,
      transports: passkey.transports?.split(",") as never,
    })),
  });
  // One WebAuthn challenge per pending challenge: a new one replaces the
  // last, and it never outlives the sign-in it belongs to.
  const identifier = stepIdentifier(pending);
  await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
  await ctx.context.internalAdapter.createVerificationValue({
    identifier,
    value: JSON.stringify({
      expectedChallenge: options.challenge,
      userId: pending.userId,
    }),
    expiresAt: new Date(
      Math.min(
        Date.now() + PASSKEY_STEP_SECONDS * 1000,
        pending.expiresAt.getTime()
      )
    ),
  });
  return ctx.json(options);
}

async function verifyPasskey(
  ctx: GenericEndpointContext,
  relyingParty: PasskeyRelyingParty | null
) {
  const pending = await requirePendingChallenge(ctx);
  if (!relyingParty) throw unavailable();
  const { response, trustDevice } = ctx.body as z.infer<typeof verifyBody>;

  const row = await twoFactorRow(ctx, pending.userId);
  await assertNotLocked(ctx, row);
  const attempt = await beginChallengeAttempt(ctx, pending, CHALLENGE_ATTEMPTS);

  // The WebAuthn challenge works once, and only for this sign-in.
  const stored = await ctx.context.internalAdapter.consumeVerificationValue(
    stepIdentifier(pending)
  );
  let expected: { expectedChallenge?: unknown; userId?: unknown } | null = null;
  try {
    expected = stored ? JSON.parse(stored.value) : null;
  } catch {
    expected = null;
  }
  if (
    typeof expected?.expectedChallenge !== "string" ||
    expected.userId !== pending.userId
  ) {
    // Nothing was checked: the attempt doesn't count.
    await attempt.restore();
    throw new APIError("BAD_REQUEST", {
      ...PASSKEY_STEP_ERRORS.CHALLENGE_NOT_FOUND,
    });
  }

  const fail = async (error: { code: string; message: string }) => {
    await attempt.recordFailure();
    await recordAccountFailure(ctx, row);
    return new APIError("UNAUTHORIZED", { ...error });
  };

  // Only this person's passkeys: another account's credential is a wrong
  // answer, never a way in.
  const passkey = await ctx.context.adapter.findOne<PasskeyRow>({
    model: PASSKEY_TABLE,
    where: [
      { field: "credentialID", value: response.id },
      { field: "userId", value: pending.userId },
    ],
  });
  if (!passkey) throw await fail(PASSKEY_STEP_ERRORS.INVALID_PASSKEY);

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: response as unknown as AuthenticationResponseJSON,
      expectedChallenge: expected.expectedChallenge,
      expectedOrigin: relyingParty.origin,
      expectedRPID: relyingParty.rpID,
      credential: {
        id: passkey.credentialID,
        publicKey: base64Bytes(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports?.split(",") as never,
      },
      requireUserVerification: true,
    });
  } catch (error) {
    ctx.context.logger.info("Passkey second step refused", {
      reason: error instanceof Error ? error.message : String(error),
    });
    // The flag only picks the message: the signature check above refused it.
    throw await fail(
      passkeyAssertionUserVerified({ response })
        ? PASSKEY_STEP_ERRORS.INVALID_PASSKEY
        : PASSKEY_STEP_ERRORS.USER_VERIFICATION_REQUIRED
    );
  }
  if (
    !(verification.verified && verification.authenticationInfo.userVerified)
  ) {
    throw await fail(
      verification.verified
        ? PASSKEY_STEP_ERRORS.USER_VERIFICATION_REQUIRED
        : PASSKEY_STEP_ERRORS.INVALID_PASSKEY
    );
  }

  await ctx.context.adapter.update({
    model: PASSKEY_TABLE,
    where: [{ field: "id", value: passkey.id }],
    update: { counter: verification.authenticationInfo.newCounter },
  });
  await resetAccountFailures(ctx, row);
  return finishChallenge(ctx, pending, { trustDevice: trustDevice === true });
}

/** The passkey second step's endpoints, for the challenge plugin. */
export function passkeyStepEndpoints(relyingParty: PasskeyRelyingParty | null) {
  return {
    twoFactorMethods: createAuthEndpoint(
      TWO_FACTOR_METHODS_PATH,
      { method: "GET" },
      async (ctx) => {
        const pending = await requirePendingChallenge(ctx);
        return ctx.json(
          await twoFactorMethodsFor(ctx, pending.userId, relyingParty)
        );
      }
    ),
    passkeyStepOptions: createAuthEndpoint(
      PASSKEY_STEP_OPTIONS_PATH,
      { method: "POST" },
      (ctx) => passkeyOptions(ctx, relyingParty)
    ),
    passkeyStepVerify: createAuthEndpoint(
      PASSKEY_STEP_VERIFY_PATH,
      { method: "POST", body: verifyBody },
      (ctx) => verifyPasskey(ctx, relyingParty)
    ),
  };
}
