/**
 * The second step of signing in: which method to show, what to call it and
 * what to say when it fails. Pure and client-safe; two-factor-challenge.tsx
 * renders it, tests/auth/sign-in-challenge-ui.test.ts checks it.
 */
import type { PasskeyStepResult } from "@repo/auth/passkey-client";
import {
  BACKUP_CODE_ALPHABET,
  LOCKOUT_MINUTES,
  type TwoFactorMethods,
} from "@repo/auth/sign-in-challenge-rules";

export type SecondStep = "passkey" | "totp" | "backup";

/** The heading while each method is shown. */
export const SECOND_STEP_TITLES: Record<SecondStep, string> = {
  passkey: "Use your passkey",
  totp: "Open your authenticator app",
  backup: "Enter a backup code",
};

/** The links that switch to each method. */
export const SWITCH_TO: Record<SecondStep, string> = {
  passkey: "Use your passkey",
  totp: "Use an authenticator code",
  backup: "Use a backup code",
};

/**
 * The methods to offer, best first: a passkey (when this browser can use
 * one), the authenticator app, backup codes. `methods` is null when the
 * server couldn't say; then everything this browser can do is offered, with
 * the passkey last so its prompt doesn't open for someone without one.
 */
export function offeredSteps(
  methods: TwoFactorMethods | null,
  passkeysHere: boolean,
): SecondStep[] {
  if (!methods) {
    return passkeysHere ? ["totp", "backup", "passkey"] : ["totp", "backup"];
  }
  const steps: SecondStep[] = [];
  if (passkeysHere && methods.passkey) steps.push("passkey");
  if (methods.totp) steps.push("totp");
  if (methods.backupCodes) steps.push("backup");
  return steps;
}

/** The method to start with: the one used last here, else the best. */
export function firstStep(
  steps: readonly SecondStep[],
  remembered: SecondStep | null,
): SecondStep | null {
  if (remembered && steps.includes(remembered)) return remembered;
  return steps[0] ?? null;
}

// The method that last finished a sign-in in this browser. Only its name is
// kept, never a code.
const REMEMBERED_KEY = "qrdx:second-step";

function isSecondStep(value: unknown): value is SecondStep {
  return value === "passkey" || value === "totp" || value === "backup";
}

export function readRememberedStep(): SecondStep | null {
  try {
    const value = window.localStorage.getItem(REMEMBERED_KEY);
    return isSecondStep(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberStep(step: SecondStep): void {
  try {
    window.localStorage.setItem(REMEMBERED_KEY, step);
  } catch {
    // Private windows and blocked storage: nothing to remember then.
  }
}

export const PASSKEY_STEP_MESSAGES = {
  hint: "Use Touch ID, Face ID, Windows Hello or a security key.",
  waiting: "Waiting for your passkey…",
  checking: "Checking your passkey…",
  failed: "Couldn't verify your passkey. Try again.",
  closed:
    "The passkey prompt was closed or timed out. Try again or use another method.",
  // The server no longer had the request the passkey answered (it expired,
  // or another tab asked for a newer one).
  expiredRequest: "That passkey request expired. Try again.",
  userVerification:
    "That passkey didn't ask for your PIN, fingerprint or face. Use one that does, or use another method.",
  unavailable: "There's no passkey for this account here. Use another method.",
  tooManyTries: "Too many failed tries. Sign in again to try again.",
  locked: `Too many failed tries in a row. Try again in ${LOCKOUT_MINUTES} minutes.`,
  expired: "This sign-in timed out. Sign in again.",
  rateLimited: "Too many tries. Wait a moment, then try again.",
  connection: "Something went wrong. Check your connection and try again.",
} as const;

/** No method this browser can use (a passkey-only account, no WebAuthn). */
export const NO_STEP_HERE =
  "This browser can't use your passkey, and there's no other way to finish signing in here. Use a device with your passkey.";

/**
 * A prompt that failed this quickly never showed: the browser refused to
 * open it without a click (some do when it opens on its own) or the page
 * wasn't focused. Then the button is offered without an error.
 */
export const PROMPT_REFUSED_MS = 1_000;

export interface PasskeyStepOutcome {
  /** The line under the button; null shows the hint instead. */
  message: string | null;
  /** This challenge can't be finished any more: only "Sign in again". */
  over: boolean;
  /** A wrong answer, counted against the challenge's attempts. */
  counted: boolean;
}

/** What a failed passkey step means for the page. */
export function passkeyStepOutcome(
  result: Extract<PasskeyStepResult, { ok: false }>,
  { automatic }: { automatic: boolean },
): PasskeyStepOutcome {
  const quiet = { over: false, counted: false };
  if (result.kind === "aborted") return { message: null, ...quiet };
  if (result.kind === "prompt") {
    if (automatic && result.promptMs < PROMPT_REFUSED_MS) {
      return { message: null, ...quiet };
    }
    return { message: PASSKEY_STEP_MESSAGES.closed, ...quiet };
  }
  if (result.kind === "browser") {
    return { message: PASSKEY_STEP_MESSAGES.failed, ...quiet };
  }
  switch (result.code) {
    case "INVALID_PASSKEY":
      return {
        message: PASSKEY_STEP_MESSAGES.failed,
        over: false,
        counted: true,
      };
    case "PASSKEY_USER_VERIFICATION_REQUIRED":
      return {
        message: PASSKEY_STEP_MESSAGES.userVerification,
        over: false,
        counted: true,
      };
    case "PASSKEY_CHALLENGE_NOT_FOUND":
      return { message: PASSKEY_STEP_MESSAGES.expiredRequest, ...quiet };
    case "PASSKEY_STEP_UNAVAILABLE":
      return { message: PASSKEY_STEP_MESSAGES.unavailable, ...quiet };
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return {
        message: PASSKEY_STEP_MESSAGES.tooManyTries,
        over: true,
        counted: false,
      };
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return {
        message: PASSKEY_STEP_MESSAGES.locked,
        over: true,
        counted: false,
      };
    case "INVALID_TWO_FACTOR_COOKIE":
      return {
        message: PASSKEY_STEP_MESSAGES.expired,
        over: true,
        counted: false,
      };
  }
  if (result.status === 429) {
    return { message: PASSKEY_STEP_MESSAGES.rateLimited, ...quiet };
  }
  return { message: PASSKEY_STEP_MESSAGES.connection, ...quiet };
}

/** An authenticator code from an account without an authenticator app. */
export const NO_AUTHENTICATOR_APP =
  "Your account doesn't use an authenticator app. Use another method.";

const quoteList = (chars: readonly string[]) =>
  chars.map((char) => `"${char}"`).join(" or ");

/**
 * Why what someone typed can't be a backup code ("ABCDE-FGH23": 10 capital
 * letters and digits 2 to 9, any case, dash and spaces optional), or null
 * when it could be one.
 */
export function backupCodeProblem(input: string): string | null {
  const chars = input.replace(/[\s-]+/g, "").toUpperCase();
  if (!chars) return "Enter one of your backup codes.";
  const strange = [...new Set(chars)].filter((char) => !/[A-Z0-9]/.test(char));
  if (strange.length) {
    return `Backup codes only have letters and digits. Remove ${quoteList(strange)}.`;
  }
  if (chars.length !== 10) {
    return `Backup codes have 10 characters, like ABCDE-FGH23. This has ${chars.length}.`;
  }
  const lookalikes = [...new Set(chars)].filter(
    (char) => !BACKUP_CODE_ALPHABET.includes(char),
  );
  if (lookalikes.length) {
    return `Backup codes never use ${quoteList(lookalikes)}. Check for a look-alike letter or digit.`;
  }
  return null;
}
