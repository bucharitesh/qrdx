"use client";

import { authClient } from "@repo/auth/client";
import { passkeyStep } from "@repo/auth/passkey-client";
import {
  PASSKEY_STEP_OPTIONS_PATH,
  PASSKEY_STEP_VERIFY_PATH,
  TWO_FACTOR_METHODS_PATH,
  type TwoFactorMethods,
} from "@repo/auth/sign-in-challenge-rules";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@repo/design-system/components/ui/input-otp";
import { Label } from "@repo/design-system/components/ui/label";
import { FingerScan } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import {
  type AuthClientError,
  CHALLENGE_ATTEMPTS,
  challengeFailure,
  normalizeBackupCode,
  TRUST_DEVICE_DAYS,
  TWO_FACTOR_MESSAGES,
} from "@/lib/auth/two-factor";
import { browserHasPasskeys, passkeysWorkOn } from "@/lib/passkeys";
import { cancelTwoFactorChallenge } from "../sign-in/_lib/two-factor-actions";
import {
  backupCodeProblem,
  firstStep,
  NO_AUTHENTICATOR_APP,
  NO_STEP_HERE,
  offeredSteps,
  PASSKEY_STEP_MESSAGES,
  passkeyStepOutcome,
  readRememberedStep,
  rememberStep,
  type SecondStep,
  SWITCH_TO,
} from "./second-step";

const CODE_LENGTH = 6;
const DIGITS_ONLY = "^\\d+$";

// Small text links in 40 px rows: full tap targets that never overlap when
// stacked.
const TEXT_ACTION =
  "inline-flex min-h-10 items-center rounded-sm text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const HINTS: Record<SecondStep, string> = {
  passkey: PASSKEY_STEP_MESSAGES.hint,
  totp: "Enter the 6-digit code from your authenticator app.",
  backup: "Enter one of your backup codes. Each works once.",
};

type FetchResult<T> =
  | { data: T; error: null }
  | {
      data: null;
      error: { code?: string; message?: string; status: number };
    };

/** A request to the challenge's own endpoints, as `{ data, error }`. */
function challengeFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<FetchResult<T>> {
  return authClient.$fetch(path, { ...init, throw: false }) as Promise<
    FetchResult<T>
  >;
}

interface TwoFactorChallengeProps {
  /** Signed in: go on to where the sign-in was headed. */
  onVerified: () => void;
  /** The challenge was dropped: back to the sign-in options. */
  onCancel: () => void;
  /** The method on screen (null while it's being worked out), for the heading. */
  onStepChange?: (step: SecondStep | null) => void;
}

/**
 * The second step of signing in with two-step verification on: one of the
 * person's passkeys (its prompt opens on its own), a code from the
 * authenticator app or a backup code, whichever they have, and "don't ask
 * again" for this device. Shown by /sign-in/two-factor (Google, GitHub and
 * SSO land there) and inside the email-code dialog.
 */
export function TwoFactorChallenge({
  onVerified,
  onCancel,
  onStepChange,
}: TwoFactorChallengeProps) {
  const t = useTranslations("auth.twoFactorChallenge");
  const id = useId();
  const passkeysOffered = useAvailability().has("passkeys");
  // The methods this person can use here; null while they're looked up.
  const [steps, setSteps] = useState<SecondStep[] | null>(null);
  const [mode, setMode] = useState<SecondStep | null>(null);
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // The browser's passkey prompt is open.
  const [prompting, setPrompting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  // Too many wrong answers, locked or expired: only "sign in again" is left.
  const [over, setOver] = useState(false);

  // Read when an answer goes out, after the state may have changed: the
  // checkbox can be ticked while a passkey prompt is open.
  const latest = useRef({ trustDevice, wrongTries, over, onVerified });
  latest.current = { trustDevice, wrongTries, over, onVerified };
  const busy = useRef(false);
  const stepChange = useRef(onStepChange);
  stepChange.current = onStepChange;

  const passkey = useMemo(
    () =>
      passkeyStep({
        options: () =>
          challengeFetch<Record<string, unknown>>(PASSKEY_STEP_OPTIONS_PATH, {
            method: "POST",
            body: {},
          }),
        verify: ({ response }) =>
          challengeFetch(PASSKEY_STEP_VERIFY_PATH, {
            method: "POST",
            body: { response, trustDevice: latest.current.trustDevice },
          }),
      }),
    [],
  );

  useEffect(() => {
    stepChange.current?.(mode);
  }, [mode]);

  /** A wrong answer: counts towards the challenge's limit. */
  const countWrong = (step: SecondStep): boolean => {
    const tries = latest.current.wrongTries + 1;
    setWrongTries(tries);
    // The plugin allows 5 wrong answers per challenge; the next one only
    // ends it, so say so now.
    if (tries >= CHALLENGE_ATTEMPTS) {
      setError(
        step === "passkey"
          ? PASSKEY_STEP_MESSAGES.tooManyTries
          : TWO_FACTOR_MESSAGES.tooManyAttempts,
      );
      setOver(true);
      return true;
    }
    return false;
  };

  const finish = (step: SecondStep) => {
    rememberStep(step);
    latest.current.onVerified();
  };

  /**
   * Opens the browser's passkey prompt and checks the answer. `fromButton`:
   * the "Continue with passkey" click; anything else (opening on its own,
   * switching methods) stays quiet when the browser refuses to open it.
   */
  const startPasskey = async ({ fromButton }: { fromButton: boolean }) => {
    if (busy.current || latest.current.over) return;
    busy.current = true;
    setPrompting(true);
    setError(null);
    try {
      const result = await passkey.run({
        onPromptDone: () => {
          setPrompting(false);
          setChecking(true);
        },
      });
      if (result.ok) {
        finish("passkey");
        return;
      }
      // Signed in meanwhile (another tab finished it): carry on.
      if (result.kind === "server" && result.code === "ALREADY_SIGNED_IN") {
        latest.current.onVerified();
        return;
      }
      const outcome = passkeyStepOutcome(result, { automatic: !fromButton });
      if (outcome.counted && countWrong("passkey")) return;
      setError(outcome.message);
      if (outcome.over) setOver(true);
      // The server used up the last options: fetch the next ones now, so a
      // click can open the prompt straight away.
      if (
        !outcome.over &&
        result.kind === "server" &&
        result.code !== "PASSKEY_STEP_UNAVAILABLE"
      ) {
        void passkey.prepare();
      }
    } catch (failure) {
      console.error("Passkey second step failed:", failure);
      setError(PASSKEY_STEP_MESSAGES.connection);
    } finally {
      busy.current = false;
      setPrompting(false);
      setChecking(false);
    }
  };
  const startPasskeyRef = useRef(startPasskey);
  startPasskeyRef.current = startPasskey;

  // Which methods this person has, then the one to start with: the method
  // used last in this browser, else a passkey, whose prompt opens on its own.
  useEffect(() => {
    let active = true;
    void (async () => {
      const passkeysHere =
        passkeysOffered &&
        browserHasPasskeys() &&
        passkeysWorkOn(window.location.origin);
      let methods: TwoFactorMethods | null = null;
      try {
        const { data, error: failure } = await challengeFetch<TwoFactorMethods>(
          TWO_FACTOR_METHODS_PATH,
          {
            method: "GET",
          },
        );
        if (failure?.status === 401) {
          if (!active) return;
          setSteps([]);
          setError(TWO_FACTOR_MESSAGES.expired);
          setOver(true);
          return;
        }
        if (failure) {
          console.error("Couldn't load the sign-in methods:", failure);
        } else {
          methods = data;
        }
      } catch (failure) {
        console.error("Couldn't load the sign-in methods:", failure);
      }
      if (!active) return;
      const offered = offeredSteps(methods, passkeysHere);
      const first = firstStep(offered, readRememberedStep());
      setSteps(offered);
      setMode(first);
      if (first === "passkey")
        void startPasskeyRef.current({ fromButton: false });
    })();
    return () => {
      active = false;
      passkey.cancel();
    };
  }, [passkeysOffered, passkey]);

  const fail = (failure: AuthClientError, step: "totp" | "backup") => {
    const wrong =
      failure.code === "INVALID_CODE" || failure.code === "INVALID_BACKUP_CODE";
    if (wrong && countWrong(step)) return;
    if (failure.code === "TOTP_NOT_ENABLED") {
      setError(NO_AUTHENTICATOR_APP);
      return;
    }
    const result = challengeFailure(failure, step);
    setError(result.message);
    if (result.over) setOver(true);
  };

  const submit = async (value: string) => {
    if (checking || over || (mode !== "totp" && mode !== "backup")) return;
    const step = mode;
    setChecking(true);
    setError(null);
    try {
      const { error: failure } =
        step === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice })
          : await authClient.twoFactor.verifyBackupCode({
              code: value,
              trustDevice,
            });
      if (failure) {
        // Signed in meanwhile (another tab finished it): carry on.
        if (failure.code === "ALREADY_SIGNED_IN") {
          onVerified();
          return;
        }
        setCode("");
        fail(failure, step);
        return;
      }
      finish(step);
    } catch (failure) {
      console.error("Two-step verification failed:", failure);
      setCode("");
      setError(TWO_FACTOR_MESSAGES.failed);
    } finally {
      setChecking(false);
    }
  };

  const submitBackupCode = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = backupCodeProblem(backupCode);
    const normalized = normalizeBackupCode(backupCode);
    if (problem || !normalized) {
      setError(problem ?? TWO_FACTOR_MESSAGES.invalidBackupCode);
      return;
    }
    void submit(normalized);
  };

  const switchTo = (step: SecondStep) => {
    passkey.cancel();
    setMode(step);
    setCode("");
    setBackupCode("");
    if (!over) setError(null);
    if (step === "passkey") void startPasskey({ fromButton: false });
  };

  const leave = async () => {
    passkey.cancel();
    setLeaving(true);
    try {
      await cancelTwoFactorChallenge();
    } catch (failure) {
      // The challenge expires by itself; going back still works.
      console.error("Dropping the two-step challenge failed:", failure);
    }
    onCancel();
  };

  const statusId = `${id}-status`;
  const working = prompting || checking;
  const status = (
    <p
      aria-live="polite"
      className="flex min-h-5 items-center justify-center gap-1.5 text-center text-xs text-pretty text-muted-foreground data-[error=true]:text-destructive"
      data-error={Boolean(error) && !working}
      id={statusId}
      role={error && !working ? "alert" : undefined}
    >
      {working ? (
        <>
          <Spinner className="size-3.5" />
          {prompting
            ? PASSKEY_STEP_MESSAGES.waiting
            : mode === "passkey"
              ? PASSKEY_STEP_MESSAGES.checking
              : t("checkingCode")}
        </>
      ) : (
        (error ??
        (mode ? HINTS[mode] : steps?.length === 0 ? NO_STEP_HERE : ""))
      )}
    </p>
  );

  const alternatives = (steps ?? []).filter((step) => step !== mode);

  return (
    <div className="flex flex-col items-center gap-4">
      {steps === null ? (
        <div
          aria-busy="true"
          className="flex h-11 w-full items-center justify-center"
        >
          <Spinner className="size-5 text-muted-foreground" />
          <span className="sr-only">{t("loadingYourSignInMethods")}</span>
        </div>
      ) : mode === "passkey" ? (
        <Button
          aria-describedby={statusId}
          className="h-10 w-full"
          disabled={over || leaving || working}
          onClick={() => void startPasskey({ fromButton: true })}
        >
          <FingerScan className="size-5" />
          {t("continueWithPasskey")}
          {working && <Spinner className="size-4" />}
        </Button>
      ) : mode === "totp" ? (
        <InputOTP
          aria-describedby={statusId}
          aria-label={t("authenticatorCode")}
          autoComplete="one-time-code"
          autoFocus
          containerClassName="justify-center gap-3"
          disabled={over || leaving}
          inputMode="numeric"
          maxLength={CODE_LENGTH}
          onChange={(value) => {
            if (checking) return;
            setCode(value);
            if (value && !over) setError(null);
          }}
          onComplete={(value) => void submit(value)}
          pattern={DIGITS_ONLY}
          value={code}
        >
          {[0, 3].map((start) => (
            <InputOTPGroup key={start}>
              {[start, start + 1, start + 2].map((index) => (
                <InputOTPSlot
                  aria-invalid={Boolean(error) && !code}
                  className="h-11 w-11 text-lg font-medium tabular-nums"
                  index={index}
                  key={index}
                />
              ))}
            </InputOTPGroup>
          ))}
        </InputOTP>
      ) : mode === "backup" ? (
        <form
          className="grid w-full gap-2"
          noValidate
          onSubmit={submitBackupCode}
        >
          <Label className="sr-only" htmlFor={`${id}-backup`}>
            {t("backupCode")}
          </Label>
          <Input
            aria-describedby={statusId}
            aria-invalid={Boolean(error)}
            autoCapitalize="characters"
            autoComplete="one-time-code"
            autoCorrect="off"
            autoFocus
            className="text-center font-mono tracking-wider uppercase max-sm:h-10"
            disabled={over || leaving || checking}
            id={`${id}-backup`}
            onChange={(event) => {
              setBackupCode(event.target.value);
              if (!over) setError(null);
            }}
            placeholder={t("abcdeFgh23")}
            spellCheck={false}
            value={backupCode}
          />
          <Button
            className="w-full max-sm:h-10"
            disabled={over || leaving || checking || !backupCode.trim()}
            type="submit"
          >
            {t("verify")}
            {checking && <Spinner className="size-4" />}
          </Button>
        </form>
      ) : null}

      {status}

      {over ? (
        <Button
          className="w-full max-sm:h-10"
          disabled={leaving}
          onClick={() => void leave()}
          variant="outline"
        >
          {t("signInAgain")}
          {leaving && <Spinner className="size-4" />}
        </Button>
      ) : (
        <>
          {mode && (
            <div className="flex items-center gap-2 self-start">
              <Checkbox
                // A 40 px tap target around the 16 px box.
                className="relative after:absolute after:-inset-3"
                checked={trustDevice}
                disabled={checking || leaving}
                id={`${id}-trust`}
                onCheckedChange={(checked) => setTrustDevice(checked === true)}
              />
              <Label
                className="-my-3 min-h-10 py-3 text-xs font-normal text-muted-foreground"
                htmlFor={`${id}-trust`}
              >
                {t("dontAskAgainOnThis", { TRUST_DEVICE_DAYS })}
              </Label>
            </div>
          )}
          {/* The other methods on the left, one per row; leaving on the right, level with the last row. */}
          <div className="-my-2 flex w-full items-end justify-between gap-4">
            <div className="flex flex-col items-start">
              {alternatives.map((step) => (
                <button
                  className={TEXT_ACTION}
                  disabled={checking || leaving}
                  key={step}
                  onClick={() => switchTo(step)}
                  type="button"
                >
                  {SWITCH_TO[step]}
                </button>
              ))}
            </div>
            <button
              className={TEXT_ACTION}
              disabled={checking || leaving}
              onClick={() => void leave()}
              type="button"
            >
              {t("useAnotherAccount")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
