"use client";

import { authClient } from "@repo/auth/client";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@repo/design-system/components/ui/input-otp";
import { Label } from "@repo/design-system/components/ui/label";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icons } from "@/components/icons";

const CODE_LENGTH = 6;
// Matches the server: 3 tries per code, a 5-minute expiry.
const TRIES_PER_CODE = 3;
const RESEND_COOLDOWN_MS = 30_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIGITS_ONLY = "^\\d+$";

const TEXT_ACTION =
  "rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

type AuthError = { code?: string; status?: number } | null | undefined;

function sendErrorMessage(error: NonNullable<AuthError>): string {
  if (error.status === 429) {
    return "Too many codes requested. Wait a minute, then try again.";
  }
  if (error.code === "INVALID_EMAIL") return "Enter a valid email address.";
  return "We couldn't send a code right now. Try again, or use Google or GitHub.";
}

/** Message, and whether this code can no longer be used. */
function verifyErrorMessage(error: NonNullable<AuthError>): [string, boolean] {
  if (error.status === 429) {
    return ["Too many tries. Wait a minute, then try again.", false];
  }
  switch (error.code) {
    case "INVALID_OTP":
      return ["That code isn't right. Check the email and try again.", false];
    case "OTP_EXPIRED":
      return ["That code has expired. Send a new one.", true];
    case "TOO_MANY_ATTEMPTS":
      return ["Too many wrong tries. Send a new code.", true];
    case "BANNED_USER":
      return [
        "This account is suspended. Contact support if you think that's a mistake.",
        true,
      ];
    default:
      return ["Something went wrong. Try again.", false];
  }
}

interface EmailCodeSignInProps {
  /** Address the code went to; null shows the email step */
  sentTo: string | null;
  onSentToChange: (email: string | null) => void;
  /** Same-site path to open after signing in; otherwise stay on the page */
  redirectTo?: string;
  onSignedIn: () => void;
  /** Another sign-in method is in progress */
  disabled?: boolean;
  lastUsed?: boolean;
}

/** Sign in with a one-time code sent by email (creates the account on first use). */
export function EmailCodeSignIn({
  sentTo,
  onSentToChange,
  redirectTo,
  onSignedIn,
  disabled = false,
  lastUsed = false,
}: EmailCodeSignInProps) {
  const router = useRouter();
  const id = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  const [codeDead, setCodeDead] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  // Back from the code step: put the cursor in the email field again.
  const wasCodeStep = useRef(false);
  useEffect(() => {
    if (sentTo) {
      wasCodeStep.current = true;
    } else if (wasCodeStep.current) {
      wasCodeStep.current = false;
      emailRef.current?.focus();
    }
  }, [sentTo]);

  const requestCode = async (address: string, resend: boolean) => {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: address,
        type: "sign-in",
      });
      if (error) {
        setError(sendErrorMessage(error));
        return;
      }
      const time = Date.now();
      setNow(time);
      setResendAt(time + RESEND_COOLDOWN_MS);
      setCode("");
      setWrongTries(0);
      setCodeDead(false);
      if (resend) setNotice("New code sent. The old one no longer works.");
      else onSentToChange(address);
    } catch (err) {
      console.error("Email code request failed:", err);
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const handleEmailSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    void requestCode(address, false);
  };

  const verify = async (otp: string) => {
    if (!sentTo || verifying) return;
    // Captured now: closing the dialog clears the caller's callback URL.
    const target = redirectTo;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const { error } = await authClient.signIn.emailOtp({
        email: sentTo,
        otp,
      });
      if (error) {
        setCode("");
        const tries =
          error.code === "INVALID_OTP" ? wrongTries + 1 : wrongTries;
        setWrongTries(tries);
        if (error.code === "INVALID_OTP" && tries >= TRIES_PER_CODE) {
          setError("Too many wrong tries. Send a new code.");
          setCodeDead(true);
        } else {
          const [message, dead] = verifyErrorMessage(error);
          setError(message);
          if (dead) setCodeDead(true);
        }
        return;
      }
      // The session updates in place; server-rendered parts need a refresh.
      if (target) router.push(target);
      else router.refresh();
      onSignedIn();
    } catch (err) {
      console.error("Email code sign-in failed:", err);
      setCode("");
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setVerifying(false);
    }
  };

  const changeEmail = () => {
    setCode("");
    setError(null);
    setNotice(null);
    setCodeDead(false);
    onSentToChange(null);
  };

  if (sentTo) {
    const statusId = `${id}-status`;
    return (
      <div className="flex flex-col items-center gap-4 px-6 pb-6">
        <InputOTP
          aria-describedby={statusId}
          aria-label="Sign-in code"
          autoFocus
          containerClassName="justify-center gap-3"
          disabled={codeDead}
          maxLength={CODE_LENGTH}
          onChange={(value) => {
            if (verifying) return;
            setCode(value);
            if (value) setError(null);
          }}
          onComplete={(value) => void verify(value)}
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

        <p
          aria-live="polite"
          className="flex min-h-5 items-center gap-1.5 text-center text-xs text-pretty text-muted-foreground data-[error=true]:text-destructive"
          data-error={Boolean(error)}
          id={statusId}
          role={error ? "alert" : undefined}
        >
          {verifying ? (
            <>
              <Icons.Loader className="size-3.5" />
              Checking code…
            </>
          ) : (
            (error ?? notice ?? "The code expires in 5 minutes.")
          )}
        </p>

        <div className="flex w-full items-center justify-between gap-4">
          <button
            className={TEXT_ACTION}
            disabled={verifying}
            onClick={changeEmail}
            type="button"
          >
            Use a different email
          </button>
          <button
            className={`${TEXT_ACTION} tabular-nums`}
            disabled={secondsLeft > 0 || sending || verifying}
            onClick={() => void requestCode(sentTo, true)}
            type="button"
          >
            {sending
              ? "Sending…"
              : secondsLeft > 0
                ? `Resend in ${secondsLeft}s`
                : "Resend"}
          </button>
        </div>
      </div>
    );
  }

  const errorId = `${id}-error`;
  return (
    <form className="grid gap-2 px-6" noValidate onSubmit={handleEmailSubmit}>
      <Label className="sr-only" htmlFor={`${id}-email`}>
        Email address
      </Label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        autoCapitalize="none"
        autoComplete="email"
        disabled={disabled || sending}
        id={`${id}-email`}
        inputMode="email"
        onChange={(event) => {
          setEmail(event.target.value);
          setError(null);
        }}
        placeholder="you@example.com"
        ref={emailRef}
        spellCheck={false}
        type="email"
        value={email}
      />
      <div className="relative">
        <Button
          className="w-full"
          disabled={disabled || sending}
          type="submit"
          variant="outline"
        >
          <Icons.Mail className="size-5" />
          <span className="font-medium">Email me a code</span>
          {sending && <Icons.Loader className="size-4" />}
        </Button>
        {lastUsed && (
          <Badge
            className="pointer-events-none absolute -top-2 right-3 px-1.5 py-0 text-[10px]"
            variant="secondary"
          >
            Last used
          </Badge>
        )}
      </div>
      {error && (
        <p
          className="text-xs text-pretty text-destructive"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      )}
    </form>
  );
}
