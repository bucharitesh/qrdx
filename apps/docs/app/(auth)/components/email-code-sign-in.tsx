"use client";

import { authClient } from "@repo/auth/client";
import { SSO_REQUIRED_ERROR as SSO_REQUIRED } from "@repo/auth/sso-required-rules";
import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@repo/design-system/components/ui/input-otp";
import { Label } from "@repo/design-system/components/ui/label";
import { Sms } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ssoSignInErrorMessage } from "@/ee/sso/messages";
import { type SsoSignInOffer, ssoSignInOffer } from "@/ee/sso/sign-in-offer";
import { SsoOffer } from "@/ee/sso/sso-offer";
import type { SecondStep } from "./second-step";
import { TwoFactorChallenge } from "./two-factor-challenge";

const CODE_LENGTH = 6;
// Matches the server: 3 tries per code, a 5-minute expiry.
const TRIES_PER_CODE = 3;
const RESEND_COOLDOWN_MS = 30_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIGITS_ONLY = "^\\d+$";
// How long the email step waits to hear whether to offer SSO before it just
// sends the code (a code always works).
const SSO_CHECK_TIMEOUT_MS = 4000;

const NO_SSO: SsoSignInOffer = { sso: false };

/**
 * Whether the address's domain signs in with SSO, and requires it
 * (ee/sso/sign-in-offer.ts). No offer when the check fails or is slow, so it
 * never stands between someone and their code; a server action can fail
 * after a deploy, for one.
 */
async function ssoOfferedFor(address: string): Promise<SsoSignInOffer> {
  let timer: number | undefined;
  try {
    const answer = await Promise.race([
      ssoSignInOffer(address),
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), SSO_CHECK_TIMEOUT_MS);
      }),
    ]);
    if (answer === null) {
      console.warn("The SSO check took too long; sending a code instead.");
      return NO_SSO;
    }
    return answer;
  } catch (err) {
    console.error("The SSO check failed; sending a code instead:", err);
    return NO_SSO;
  } finally {
    window.clearTimeout(timer);
  }
}

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
    case SSO_REQUIRED:
      return [ssoSignInErrorMessage(SSO_REQUIRED), true];
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
  /** The account asks for a second step (two-step verification) now, or not. */
  onTwoFactorChange?: (active: boolean) => void;
  /** The second step's method on screen, for the heading. */
  onSecondStepChange?: (step: SecondStep | null) => void;
  /**
   * Workspace SSO runs on this server: before emailing a code, the email
   * step asks whether the address's domain signs in with SSO, and offers
   * that first. Absent or null: codes only, nothing is asked.
   */
  sso?: { callbackURL: () => string; lastUsed?: boolean } | null;
  /**
   * The address being offered SSO, or null when that step isn't showing;
   * `required` when its domain requires SSO.
   */
  onSsoOfferChange?: (email: string | null, required: boolean) => void;
}

/**
 * Sign in with a one-time code sent by email (creates the account on first
 * use). Where workspace SSO runs, an address whose company signs in with it
 * is offered SSO first, with the code still a click away.
 */
export function EmailCodeSignIn({
  sentTo,
  onSentToChange,
  redirectTo,
  onSignedIn,
  disabled = false,
  lastUsed = false,
  onTwoFactorChange,
  onSecondStepChange,
  sso = null,
  onSsoOfferChange,
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
  // Two-step verification: where to go once the second step is done.
  const [twoFactorTarget, setTwoFactorTarget] = useState<
    string | undefined | null
  >(null);
  // The address whose company signs in with SSO, while that's offered.
  const [ssoFor, setSsoFor] = useState<string | null>(null);
  // Its domain requires SSO; `refused`: a code sign-in was just turned away.
  const [ssoRequired, setSsoRequired] = useState<{
    required: boolean;
    refused: boolean;
  }>({ required: false, refused: false });

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

  // Back from the code or SSO step: put the cursor in the email field again.
  const onEmailStep = !(sentTo || ssoFor);
  const wasOtherStep = useRef(false);
  useEffect(() => {
    if (!onEmailStep) {
      wasOtherStep.current = true;
    } else if (wasOtherStep.current) {
      wasOtherStep.current = false;
      emailRef.current?.focus();
    }
  }, [onEmailStep]);

  const showSsoOffer = (
    address: string | null,
    { required = false, refused = false } = {},
  ) => {
    setSsoFor(address);
    setSsoRequired({ required, refused });
    onSsoOfferChange?.(address, address !== null && required);
  };

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
      if (resend) {
        setNotice("New code sent. The old one no longer works.");
      } else {
        showSsoOffer(null);
        onSentToChange(address);
      }
    } catch (err) {
      console.error("Email code request failed:", err);
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  // Where SSO runs, ask first: no code is emailed to someone who'll sign in
  // with SSO anyway, unless they choose it.
  const submitEmail = async (address: string) => {
    if (sso) {
      setSending(true);
      setError(null);
      setNotice(null);
      const offer = await ssoOfferedFor(address);
      if (offer.sso) {
        setSending(false);
        showSsoOffer(address, { required: offer.required === true });
        return;
      }
    }
    await requestCode(address, false);
  };

  const handleEmailSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    void submitEmail(address);
  };

  const verify = async (otp: string) => {
    if (!sentTo || verifying) return;
    // Captured now: closing the dialog clears the caller's callback URL.
    const target = redirectTo;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error } = await authClient.signIn.emailOtp({
        email: sentTo,
        otp,
      });
      if (error) {
        setCode("");
        // The address's domain requires SSO (and this isn't one of the
        // workspace's owners): back to the SSO offer, without the code.
        if (error.code === SSO_REQUIRED && sso) {
          const address = sentTo;
          onSentToChange(null);
          showSsoOffer(address, { required: true, refused: true });
          setError(ssoSignInErrorMessage(SSO_REQUIRED));
          return;
        }
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
      // The code was right; two-step verification asks for a second one.
      if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        setTwoFactorTarget(target);
        onTwoFactorChange?.(true);
        return;
      }
      finish(target);
    } catch (err) {
      console.error("Email code sign-in failed:", err);
      setCode("");
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setVerifying(false);
    }
  };

  const finish = (target: string | undefined) => {
    // The session updates in place; server-rendered parts need a refresh.
    if (target) router.push(target);
    else router.refresh();
    onSignedIn();
  };

  const changeEmail = () => {
    setCode("");
    setError(null);
    setNotice(null);
    setCodeDead(false);
    onSentToChange(null);
  };

  if (sentTo && twoFactorTarget !== null) {
    return (
      <div className="px-6 pb-6">
        <TwoFactorChallenge
          onCancel={() => {
            setTwoFactorTarget(null);
            onTwoFactorChange?.(false);
            changeEmail();
          }}
          onStepChange={onSecondStepChange}
          onVerified={() => finish(twoFactorTarget)}
        />
      </div>
    );
  }

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
              <Spinner className="size-3.5" />
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

  if (ssoFor && sso) {
    return (
      <SsoOffer
        callbackURL={sso.callbackURL}
        email={ssoFor}
        error={error}
        lastUsed={sso.lastUsed}
        onBack={() => {
          setError(null);
          showSsoOffer(null);
        }}
        onEmailCode={
          ssoRequired.refused
            ? undefined
            : () => void requestCode(ssoFor, false)
        }
        onError={setError}
        required={ssoRequired.required}
        sendingCode={sending}
      />
    );
  }

  const errorId = `${id}-error`;
  return (
    <form className="grid gap-2 px-6" noValidate onSubmit={handleEmailSubmit}>
      <Label className="sr-only" htmlFor={`${id}-email`}>
        Email address
      </Label>
      <Input
        className="h-10 sm:h-9"
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
          className="h-10 w-full sm:h-9"
          disabled={disabled || sending}
          type="submit"
          variant="outline"
        >
          <Sms className="size-5" />
          <span className="font-medium">Email me a code</span>
          {sending && <Spinner className="size-4" />}
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
