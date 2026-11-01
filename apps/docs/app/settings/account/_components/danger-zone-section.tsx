"use client";

import { authClient } from "@repo/auth/client";
import { Spinner } from "@repo/design-system/components/icons";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@repo/design-system/components/ui/input-otp";
import { Warning2 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { deleteAccount } from "@/actions/account";
import {
  DELETE_CONFIRMATION,
  type DeletionSummary,
  isDeleteConfirmed,
} from "@/lib/account/deletion";
import { resetAnalytics } from "@/lib/analytics";
import { SettingsRow, SettingsSection } from "./settings-section";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_MS = 30_000;
const DIGITS_ONLY = "^\\d+$";

/**
 * How the dialog confirms it's really you: a fresh emailed code, or (where
 * this deployment can't send codes) a sign-in within the last 10 minutes.
 */
export type ReauthMode =
  | { kind: "code" }
  | { kind: "recent-sign-in"; recent: boolean };

function Consequences({ items }: { items: string[] }) {
  return (
    <ul className="text-muted-foreground space-y-1.5 text-sm">
      {items.map((item) => (
        <li className="flex gap-2.5" key={item}>
          <span
            aria-hidden
            className="bg-muted-foreground/50 mt-2 size-1 shrink-0 rounded-full"
          />
          <span className="text-pretty">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Blockers({ items }: { items: string[] }) {
  return (
    <div
      className="border-destructive/30 bg-destructive/5 flex gap-2.5 rounded-lg border p-3 text-sm"
      role="alert"
    >
      <Warning2
        aria-hidden
        className="text-destructive mt-0.5 size-4 shrink-0"
      />
      <div className="space-y-1">
        {items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
  summary,
  reauth,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  summary: DeletionSummary;
  reauth: ReauthMode;
}) {
  const id = useId();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const confirmed = isDeleteConfirmed(confirmation);
  const needsCode = reauth.kind === "code";
  const mustSignInAgain = reauth.kind === "recent-sign-in" && !reauth.recent;
  const ready =
    confirmed &&
    summary.blockers.length === 0 &&
    !mustSignInAgain &&
    (!needsCode || code.length === CODE_LENGTH);

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
    setConfirmation("");
    setCode("");
    setCodeSent(false);
    setError(null);
  };

  const sendCode = async () => {
    setSending(true);
    setError(null);
    try {
      const { error: sendError } =
        await authClient.emailOtp.sendVerificationOtp({
          email,
          type: "sign-in",
        });
      if (sendError) {
        setError(
          sendError.status === 429
            ? "Too many codes requested. Wait a minute, then try again."
            : "We couldn't send a code right now. Please try again.",
        );
        return;
      }
      const time = Date.now();
      setNow(time);
      setResendAt(time + RESEND_COOLDOWN_MS);
      setCode("");
      setCodeSent(true);
    } catch (sendFailure) {
      console.error("Sending the code failed:", sendFailure);
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = async () => {
    if (!ready) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteAccount({
        confirmation,
        ...(needsCode && { code }),
      });
      if (!result.ok) {
        setError(result.error);
        setCode("");
        if (result.codeExpired) setCodeSent(false);
        setDeleting(false);
        return;
      }
      resetAnalytics();
      await authClient.signOut().catch(() => {});
      router.push("/");
    } catch (failure) {
      console.error("Account deletion failed:", failure);
      setError("Something went wrong. Check your connection and try again.");
      setDeleting(false);
    }
  };

  const signOutToReauth = async () => {
    await authClient.signOut().catch(() => {});
    router.push("/");
  };

  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (deleting) return;
        onOpenChange(next);
        if (!next) reset();
      }}
      open={open}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This can't be undone. If you want a copy of your data, download it
            first.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmDelete();
          }}
        >
          {summary.blockers.length > 0 && <Blockers items={summary.blockers} />}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`${id}-confirm`}>
              Type <span className="font-mono">{DELETE_CONFIRMATION}</span> to
              confirm
            </label>
            <Input
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              disabled={deleting}
              id={`${id}-confirm`}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={DELETE_CONFIRMATION}
              spellCheck={false}
              value={confirmation}
            />
          </div>

          {needsCode && (
            <div className="space-y-2">
              <p className="text-sm font-medium" id={`${id}-code-label`}>
                Code from your email
              </p>
              {codeSent ? (
                <>
                  <InputOTP
                    aria-labelledby={`${id}-code-label`}
                    disabled={deleting}
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
                            className="h-10 w-10 text-base tabular-nums"
                            index={index}
                            key={index}
                          />
                        ))}
                      </InputOTPGroup>
                    ))}
                  </InputOTP>
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-xs">
                    Sent to {email}. It expires in 5 minutes.
                    <button
                      className="hover:text-foreground rounded-sm underline underline-offset-4 disabled:pointer-events-none disabled:no-underline disabled:opacity-60"
                      disabled={sending || deleting || secondsLeft > 0}
                      onClick={sendCode}
                      type="button"
                    >
                      {secondsLeft > 0
                        ? `Send again in ${secondsLeft}s`
                        : "Send a new code"}
                    </button>
                  </p>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs text-pretty">
                    To make sure it's you, we'll email a 6-digit code to {email}
                    .
                  </p>
                  <Button
                    disabled={sending || deleting}
                    onClick={sendCode}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {sending && <Spinner className="animate-spin" />}
                    Email me a code
                  </Button>
                </div>
              )}
            </div>
          )}

          {mustSignInAgain && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm text-pretty">
                For your security, sign out and sign in again, then delete your
                account within 10 minutes.
              </p>
              <Button
                onClick={signOutToReauth}
                size="sm"
                type="button"
                variant="outline"
              >
                Sign out
              </Button>
            </div>
          )}

          <p
            aria-live="polite"
            className="text-destructive text-sm text-pretty empty:hidden"
            role={error ? "alert" : undefined}
          >
            {error}
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} type="button">
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={!ready || deleting}
              type="submit"
              variant="destructive"
            >
              {deleting && <Spinner className="animate-spin" />}
              Delete account
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DangerZoneSection({
  email,
  summary,
  reauth,
}: {
  email: string;
  summary: DeletionSummary;
  reauth: ReauthMode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <SettingsSection
      description="Permanent actions on your account."
      id="danger"
      title="Danger zone"
      tone="danger"
    >
      <SettingsRow
        description="Delete your account and everything in your personal workspace. This can't be undone."
        label="Delete account"
      >
        <div className="space-y-4">
          <Consequences items={summary.consequences} />
          {summary.blockers.length > 0 && <Blockers items={summary.blockers} />}
          <Button
            disabled={summary.blockers.length > 0}
            onClick={() => setOpen(true)}
            variant="destructive"
          >
            Delete account…
          </Button>
        </div>
      </SettingsRow>

      <DeleteAccountDialog
        email={email}
        onOpenChange={setOpen}
        open={open}
        reauth={reauth}
        summary={summary}
      />
    </SettingsSection>
  );
}
