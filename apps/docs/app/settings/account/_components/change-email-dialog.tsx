"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@repo/design-system/components/ui/input-otp";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useState } from "react";
import {
  EMAIL_CHANGE_MESSAGES,
  isSameEmail,
  MAX_EMAIL_LENGTH,
} from "@/lib/account/email-change";
import { track } from "@/lib/analytics";
import { secondFactorCodeKind } from "@/lib/auth/two-factor";
import {
  confirmEmailChange,
  type EmailChangeResult,
  requestEmailChange,
} from "../_lib/email-change-actions";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_MS = 30_000;
const DIGITS_ONLY = "^\\d+$";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

const TEXT_ACTION =
  "rounded-sm text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:no-underline";

/**
 * Moves the account to a new address: a code goes to the new address, and
 * entering it makes the change (lib/account/email-change.ts). Needs a sign-in
 * within the last day; otherwise it asks the user to sign in again first.
 * With two-step verification on, confirming also asks for a code from the
 * authenticator app or a backup code.
 */
export function ChangeEmailDialog({
  open,
  onOpenChange,
  currentEmail,
  recentSignIn,
  twoFactorOn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
  /** Signed in within the last day (checked again on the server) */
  recentSignIn: boolean;
  /** Two-step verification is on (checked again on the server) */
  twoFactorOn: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const { refetch } = authClient.useSession();
  const [newEmail, setNewEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [codeDead, setCodeDead] = useState(false);
  const [mustSignInAgain, setMustSignInAgain] = useState(!recentSignIn);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const busy = sending || confirming;
  const twoFactorReady =
    !twoFactorOn || secondFactorCodeKind(twoFactorCode) !== null;

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  const reset = () => {
    setNewEmail("");
    setSentTo(null);
    setCode("");
    setTwoFactorCode("");
    setError(null);
    setNotice(null);
    setCodeDead(false);
  };

  /** Shows a failed result; true when it was one. */
  const failed = (result: EmailChangeResult): boolean => {
    if (result.ok) return false;
    setError(result.error);
    if (result.reason === "reauth") setMustSignInAgain(true);
    if (result.reason === "code-dead") {
      setCode("");
      setCodeDead(true);
    }
    return true;
  };

  const sendCode = async (address: string, resend: boolean) => {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestEmailChange({ newEmail: address });
      if (failed(result)) return;
      const time = Date.now();
      setNow(time);
      setResendAt(time + RESEND_COOLDOWN_MS);
      setCode("");
      setCodeDead(false);
      setSentTo(address);
      if (resend) setNotice("New code sent. The old one no longer works.");
    } catch (failure) {
      console.error("Requesting the email change failed:", failure);
      setError(CONNECTION_FAILED);
    } finally {
      setSending(false);
    }
  };

  const onEmailSubmit = (event: FormEvent) => {
    event.preventDefault();
    const address = newEmail.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError(EMAIL_CHANGE_MESSAGES.invalidEmail);
      return;
    }
    if (isSameEmail(address, currentEmail)) {
      setError(EMAIL_CHANGE_MESSAGES.sameEmail);
      return;
    }
    void sendCode(address, false);
  };

  const onConfirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo || code.length !== CODE_LENGTH || !twoFactorReady || busy) {
      return;
    }
    setConfirming(true);
    setError(null);
    setNotice(null);
    try {
      const result = await confirmEmailChange({
        newEmail: sentTo,
        code,
        ...(twoFactorOn && { twoFactorCode }),
      });
      if (failed(result)) {
        // A refused authenticator or backup code didn't use the emailed one.
        if (!result.ok && result.reason === "two-factor") setTwoFactorCode("");
        else if (!result.ok && result.reason !== "code-dead") setCode("");
        return;
      }
      toast.success(`Your email is now ${sentTo}`, {
        description: `We sent a note about the change to ${currentEmail}.`,
      });
      track("email_changed");
      onOpenChange(false);
      reset();
      // The header and server-rendered parts show the new address.
      void refetch();
      router.refresh();
    } catch (failure) {
      console.error("Confirming the email change failed:", failure);
      setCode("");
      setError(CONNECTION_FAILED);
    } finally {
      setConfirming(false);
    }
  };

  const editEmail = () => {
    setSentTo(null);
    setCode("");
    setError(null);
    setNotice(null);
    setCodeDead(false);
  };

  const close = () => {
    if (busy) return;
    onOpenChange(false);
    reset();
  };

  const signOutToReauth = async () => {
    await authClient.signOut().catch(() => {});
    router.push("/");
  };

  const errorLine = (
    <p
      aria-live="polite"
      className="text-destructive text-sm text-pretty empty:hidden"
      id={`${id}-error`}
      role={error ? "alert" : undefined}
    >
      {error}
    </p>
  );

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change your email</DialogTitle>
          <DialogDescription className="text-pretty">
            {mustSignInAgain
              ? EMAIL_CHANGE_MESSAGES.reauth
              : sentTo
                ? `Enter the 6-digit code we sent to ${sentTo}. It expires in 5 minutes.`
                : `Sign-in codes and team invitations will go to the new address. ${currentEmail} keeps working until you confirm.`}
          </DialogDescription>
        </DialogHeader>

        {mustSignInAgain ? (
          <DialogFooter>
            <Button onClick={close} type="button" variant="outline">
              Cancel
            </Button>
            <Button onClick={signOutToReauth} type="button">
              Sign out
            </Button>
          </DialogFooter>
        ) : sentTo ? (
          <form className="space-y-4" onSubmit={onConfirm}>
            <div className="space-y-3">
              <InputOTP
                aria-describedby={`${id}-error ${id}-status`}
                aria-label="Code from the new address"
                autoFocus
                disabled={codeDead || confirming}
                maxLength={CODE_LENGTH}
                onChange={(value) => {
                  setCode(value);
                  if (value) setError(null);
                }}
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
              <div className="flex items-center justify-between gap-4">
                <button
                  className={TEXT_ACTION}
                  disabled={busy}
                  onClick={editEmail}
                  type="button"
                >
                  Use a different email
                </button>
                <button
                  className={`${TEXT_ACTION} tabular-nums`}
                  disabled={busy || secondsLeft > 0}
                  onClick={() => void sendCode(sentTo, true)}
                  type="button"
                >
                  {sending
                    ? "Sending…"
                    : secondsLeft > 0
                      ? `Resend in ${secondsLeft}s`
                      : "Resend code"}
                </button>
              </div>
            </div>
            {twoFactorOn && (
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium"
                  htmlFor={`${id}-2fa`}
                >
                  Code from your authenticator app, or a backup code
                </label>
                <Input
                  aria-describedby={`${id}-2fa-hint ${id}-error`}
                  autoCapitalize="none"
                  autoComplete="one-time-code"
                  autoCorrect="off"
                  className="font-mono max-sm:h-10"
                  disabled={codeDead || confirming}
                  id={`${id}-2fa`}
                  onChange={(event) => {
                    setTwoFactorCode(event.target.value);
                    setError(null);
                  }}
                  placeholder="123456"
                  spellCheck={false}
                  value={twoFactorCode}
                />
                <p
                  className="text-muted-foreground text-xs text-pretty"
                  id={`${id}-2fa-hint`}
                >
                  Two-step verification is on, so changing your email needs this
                  too. A backup code is used up.
                </p>
              </div>
            )}
            {errorLine}
            <p
              className="text-muted-foreground text-xs text-pretty"
              id={`${id}-status`}
            >
              {notice ??
                "No code? Check spam. An address that already has its own QRdx account can't be used."}
            </p>
            <DialogFooter>
              <Button
                disabled={busy}
                onClick={close}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  busy ||
                  codeDead ||
                  code.length !== CODE_LENGTH ||
                  !twoFactorReady
                }
                type="submit"
              >
                {confirming && <Spinner className="animate-spin" />}
                Change email
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form className="space-y-4" noValidate onSubmit={onEmailSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`${id}-email`}>
                New email
              </label>
              <Input
                aria-describedby={error ? `${id}-error` : undefined}
                aria-invalid={Boolean(error)}
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
                disabled={sending}
                id={`${id}-email`}
                inputMode="email"
                maxLength={MAX_EMAIL_LENGTH}
                onChange={(event) => {
                  setNewEmail(event.target.value);
                  setError(null);
                }}
                placeholder="you@example.com"
                spellCheck={false}
                type="email"
                value={newEmail}
              />
            </div>
            {errorLine}
            <DialogFooter>
              <Button
                disabled={sending}
                onClick={close}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={sending || !newEmail.trim()} type="submit">
                {sending && <Spinner className="animate-spin" />}
                Send code
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
