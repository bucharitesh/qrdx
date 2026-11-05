"use client";

import { authClient } from "@repo/auth/client";
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
import { useId, useState } from "react";
import {
  type AuthClientError,
  CHALLENGE_ATTEMPTS,
  type ChallengeMode,
  challengeFailure,
  normalizeBackupCode,
  TRUST_DEVICE_DAYS,
  TWO_FACTOR_MESSAGES,
} from "@/lib/auth/two-factor";
import { cancelTwoFactorChallenge } from "../sign-in/_lib/two-factor-actions";

const CODE_LENGTH = 6;
const DIGITS_ONLY = "^\\d+$";

// min-h-10 with -my-3 gives a 40 px tap target without changing the layout.
const TEXT_ACTION =
  "-my-3 inline-flex min-h-10 items-center rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const HINTS: Record<ChallengeMode, string> = {
  totp: "Enter the 6-digit code from your authenticator app.",
  backup: "Enter one of your backup codes. Each works once.",
};

interface TwoFactorChallengeProps {
  /** Signed in: go on to where the sign-in was headed. */
  onVerified: () => void;
  /** The challenge was dropped: back to the sign-in options. */
  onCancel: () => void;
}

/**
 * The second step of signing in with two-step verification on: a code from
 * the authenticator app or a backup code, and "don't ask again" for this
 * device. Shown by /sign-in/two-factor (Google, GitHub and SSO land there)
 * and inside the email-code dialog.
 */
export function TwoFactorChallenge({
  onVerified,
  onCancel,
}: TwoFactorChallengeProps) {
  const id = useId();
  const [mode, setMode] = useState<ChallengeMode>("totp");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  // Too many wrong codes, locked or expired: only "sign in again" is left.
  const [over, setOver] = useState(false);

  const fail = (failure: AuthClientError) => {
    const result = challengeFailure(failure, mode);
    const wrong =
      failure.code === "INVALID_CODE" || failure.code === "INVALID_BACKUP_CODE";
    const tries = wrong ? wrongTries + 1 : wrongTries;
    setWrongTries(tries);
    // The plugin allows 5 wrong codes per challenge; the next answer only
    // ends it, so say so now.
    if (wrong && tries >= CHALLENGE_ATTEMPTS) {
      setError(TWO_FACTOR_MESSAGES.tooManyAttempts);
      setOver(true);
      return;
    }
    setError(result.message);
    if (result.over) setOver(true);
  };

  const submit = async (value: string) => {
    if (checking || over) return;
    setChecking(true);
    setError(null);
    try {
      const { error: failure } =
        mode === "totp"
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
        fail(failure);
        return;
      }
      onVerified();
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
    const normalized = normalizeBackupCode(backupCode);
    if (!normalized) {
      setError(TWO_FACTOR_MESSAGES.invalidBackupCode);
      return;
    }
    void submit(normalized);
  };

  const switchMode = () => {
    setMode(mode === "totp" ? "backup" : "totp");
    setCode("");
    setBackupCode("");
    if (!over) setError(null);
  };

  const leave = async () => {
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
  const status = (
    <p
      aria-live="polite"
      className="flex min-h-5 items-center justify-center gap-1.5 text-center text-xs text-pretty text-muted-foreground data-[error=true]:text-destructive"
      data-error={Boolean(error)}
      id={statusId}
      role={error ? "alert" : undefined}
    >
      {checking ? (
        <>
          <Spinner className="size-3.5" />
          Checking code…
        </>
      ) : (
        (error ?? HINTS[mode])
      )}
    </p>
  );

  return (
    <div className="flex flex-col items-center gap-4">
      {mode === "totp" ? (
        <InputOTP
          aria-describedby={statusId}
          aria-label="Authenticator code"
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
      ) : (
        <form
          className="grid w-full gap-2"
          noValidate
          onSubmit={submitBackupCode}
        >
          <Label className="sr-only" htmlFor={`${id}-backup`}>
            Backup code
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
            placeholder="ABCDE-FGH23"
            spellCheck={false}
            value={backupCode}
          />
          <Button
            className="w-full max-sm:h-10"
            disabled={over || leaving || checking || !backupCode.trim()}
            type="submit"
          >
            Verify
            {checking && <Spinner className="size-4" />}
          </Button>
        </form>
      )}

      {status}

      {over ? (
        <Button
          className="w-full max-sm:h-10"
          disabled={leaving}
          onClick={() => void leave()}
          variant="outline"
        >
          Sign in again
          {leaving && <Spinner className="size-4" />}
        </Button>
      ) : (
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
            Don't ask again on this device for {TRUST_DEVICE_DAYS} days
          </Label>
        </div>
      )}

      <div className="flex w-full items-center justify-between gap-4">
        <button
          className={TEXT_ACTION}
          disabled={checking || leaving || over}
          onClick={switchMode}
          type="button"
        >
          {mode === "totp" ? "Use a backup code" : "Use your authenticator app"}
        </button>
        {!over && (
          <button
            className={TEXT_ACTION}
            disabled={checking || leaving}
            onClick={() => void leave()}
            type="button"
          >
            Use another account
          </button>
        )}
      </div>
    </div>
  );
}
