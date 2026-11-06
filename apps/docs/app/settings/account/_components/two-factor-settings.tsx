"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
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
import { Label } from "@repo/design-system/components/ui/label";
import { Copy, DocumentDownload, ShieldTick } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { QRCode } from "qrdx";
import { useId, useState } from "react";
import type { TwoFactorResult } from "@/lib/account/two-factor-manage";
import type { TwoFactorStatus } from "@/lib/account/two-factor-server";
import {
  BACKUP_CODE_COUNT,
  backupCodesText,
  groupSecret,
  TWO_FACTOR_MESSAGES,
} from "@/lib/auth/two-factor";
import { signInPath } from "@/lib/safe-redirect";
import {
  regenerateBackupCodes,
  startTwoFactorSetup,
} from "../_lib/two-factor-actions";
import { SettingsSection } from "./settings-section";

const CODE_LENGTH = 6;
const DIGITS_ONLY = "^\\d+$";
const REAUTH_MESSAGE =
  "For your security, sign out and sign in again, then turn on two-step verification within a day.";

type Flow =
  | { kind: "closed" }
  | { kind: "reauth" }
  | { kind: "setup"; totpUri: string; secret: string }
  | { kind: "codes"; codes: string[]; title: string }
  | { kind: "verify"; purpose: "off" | "regenerate" };

/**
 * Confirming setup and turning it off swap the session, so they go through a
 * route handler rather than a server action (lib/account/two-factor-manage.ts).
 */
async function postStep<T>(
  step: "confirm" | "turn-off",
  code: string,
): Promise<TwoFactorResult<T>> {
  try {
    const response = await fetch("/api/account/two-factor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step, code }),
    });
    if (!response.ok) return { ok: false, error: TWO_FACTOR_MESSAGES.failed };
    return (await response.json()) as TwoFactorResult<T>;
  } catch {
    return { ok: false, error: TWO_FACTOR_MESSAGES.failed };
  }
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it instead.");
  }
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function SixDigits({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  describedBy: string;
}) {
  return (
    <InputOTP
      aria-describedby={describedBy}
      aria-label="Code from your authenticator app"
      autoComplete="one-time-code"
      containerClassName="justify-center gap-3"
      disabled={disabled}
      inputMode="numeric"
      maxLength={CODE_LENGTH}
      onChange={onChange}
      onComplete={onComplete}
      pattern={DIGITS_ONLY}
      value={value}
    >
      {[0, 3].map((start) => (
        <InputOTPGroup key={start}>
          {[start, start + 1, start + 2].map((index) => (
            <InputOTPSlot
              aria-invalid={invalid}
              className="h-11 w-11 text-lg font-medium tabular-nums"
              index={index}
              key={index}
            />
          ))}
        </InputOTPGroup>
      ))}
    </InputOTP>
  );
}

export function TwoFactorSettings({
  status,
  email,
  recentSignIn,
}: {
  status: TwoFactorStatus;
  email: string;
  recentSignIn: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [flow, setFlow] = useState<Flow>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reset = () => {
    setCode("");
    setError(null);
    setSaved(false);
  };

  const close = () => {
    if (busy) return;
    // Closing the backup codes: the page shows the new state.
    if (flow.kind === "codes") router.refresh();
    setFlow({ kind: "closed" });
    reset();
  };

  const turnOn = async () => {
    reset();
    if (!recentSignIn) {
      setFlow({ kind: "reauth" });
      return;
    }
    setBusy(true);
    try {
      const result = await startTwoFactorSetup();
      if (!result.ok) {
        if (result.reason === "reauth") setFlow({ kind: "reauth" });
        else toast.error(result.error);
        return;
      }
      setFlow({
        kind: "setup",
        totpUri: result.totpUri,
        secret: result.secret,
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postStep<{ backupCodes: string[] }>(
        "confirm",
        value,
      );
      if (!result.ok) {
        setCode("");
        if (result.reason === "reauth") setFlow({ kind: "reauth" });
        else setError(result.error);
        return;
      }
      setCode("");
      setFlow({
        kind: "codes",
        codes: result.backupCodes,
        title: "Two-step verification is on",
      });
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || flow.kind !== "verify") return;
    setBusy(true);
    setError(null);
    try {
      if (flow.purpose === "off") {
        const result = await postStep("turn-off", code);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Two-step verification is off");
        setFlow({ kind: "closed" });
        reset();
        router.refresh();
        return;
      }
      const result = await regenerateBackupCodes({ code });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCode("");
      setFlow({
        kind: "codes",
        codes: result.backupCodes,
        title: "Your new backup codes",
      });
    } finally {
      setBusy(false);
    }
  };

  const signOutToReauth = async () => {
    await authClient.signOut().catch(() => {});
    router.push(signInPath("/settings/account"));
  };

  const left = status.backupCodesLeft;
  const errorId = `${id}-error`;
  const errorLine = (
    <p
      aria-live="polite"
      className="text-destructive text-sm text-pretty empty:hidden"
      id={errorId}
      role={error ? "alert" : undefined}
    >
      {error}
    </p>
  );

  return (
    <SettingsSection
      action={
        status.on ? undefined : (
          <Button
            className="max-sm:h-10"
            disabled={busy}
            onClick={turnOn}
            size="sm"
            variant="outline"
          >
            {busy && flow.kind === "closed" && (
              <Spinner className="animate-spin" />
            )}
            Turn on
          </Button>
        )
      }
      description="When you sign in, also ask for a code from an authenticator app on your phone or computer."
      id="two-factor"
      title="Two-step verification"
    >
      {/* On phones the buttons sit under the text, so it keeps its width. */}
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <span className="bg-muted/60 flex size-9 shrink-0 items-center justify-center rounded-full border">
            <ShieldTick aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Authenticator app</p>
              <Badge variant={status.on ? "secondary" : "outline"}>
                {status.on ? "On" : "Off"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
              {status.on
                ? left === null
                  ? "Signing in asks for a code from your app or a backup code."
                  : `${left} of ${BACKUP_CODE_COUNT} backup codes left.${left <= 3 ? " Make new ones soon." : ""}`
                : "Use any authenticator app that shows 6-digit codes."}
            </p>
          </div>
        </div>
        {status.on && (
          <div className="flex flex-wrap gap-2 pl-12 sm:shrink-0 sm:justify-end sm:pl-0">
            <Button
              onClick={() => {
                reset();
                setFlow({ kind: "verify", purpose: "regenerate" });
              }}
              className="max-sm:h-10"
              size="sm"
              variant="outline"
            >
              New backup codes
            </Button>
            <Button
              onClick={() => {
                reset();
                setFlow({ kind: "verify", purpose: "off" });
              }}
              className="max-sm:h-10"
              size="sm"
              variant="outline"
            >
              Turn off
            </Button>
          </div>
        )}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) close();
        }}
        open={flow.kind !== "closed"}
      >
        <DialogContent
          // On phones every button and field in these dialogs is a 40 px
          // tap target.
          className="max-sm:[&_[data-slot=button]]:h-10 max-sm:[&_[data-slot=input]]:h-10 sm:max-w-md"
        >
          {flow.kind === "reauth" && (
            <>
              <DialogHeader>
                <DialogTitle>Sign in again first</DialogTitle>
                <DialogDescription className="text-pretty">
                  {REAUTH_MESSAGE}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={close} type="button" variant="outline">
                  Cancel
                </Button>
                <Button onClick={signOutToReauth} type="button">
                  Sign out
                </Button>
              </DialogFooter>
            </>
          )}

          {flow.kind === "setup" && (
            <>
              <DialogHeader>
                <DialogTitle>Set up your authenticator app</DialogTitle>
                <DialogDescription className="text-pretty">
                  Scan this QR code with your authenticator app, then enter the
                  6-digit code it shows.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-xl border bg-white p-3">
                  <QRCode
                    bodyPattern="square"
                    cornerEyeDotPattern="square"
                    cornerEyePattern="square"
                    level="M"
                    size={168}
                    value={flow.totpUri}
                  />
                </div>
                <div className="w-full space-y-1.5">
                  <p className="text-muted-foreground text-xs">
                    Can't scan it? Enter this key in the app instead.
                  </p>
                  <div className="bg-muted/50 flex items-center gap-2 rounded-md border px-3 py-2">
                    <code className="min-w-0 flex-1 font-mono text-xs break-normal">
                      {groupSecret(flow.secret)}
                    </code>
                    <Button
                      aria-label="Copy the key"
                      onClick={() => copy(flow.secret, "Key")}
                      className="size-10"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <SixDigits
                  describedBy={errorId}
                  disabled={busy}
                  invalid={Boolean(error) && !code}
                  onChange={(value) => {
                    setCode(value);
                    if (value) setError(null);
                  }}
                  onComplete={(value) => void confirmSetup(value)}
                  value={code}
                />
                <div className="flex min-h-5 items-center justify-center">
                  {busy ? (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <Spinner className="size-3.5" />
                      Checking code…
                    </p>
                  ) : (
                    errorLine
                  )}
                </div>
              </div>
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
                  disabled={busy || code.length !== CODE_LENGTH}
                  onClick={() => void confirmSetup(code)}
                  type="button"
                >
                  Turn on
                </Button>
              </DialogFooter>
            </>
          )}

          {flow.kind === "codes" && (
            <>
              <DialogHeader>
                <DialogTitle>{flow.title}</DialogTitle>
                <DialogDescription className="text-pretty">
                  Save these backup codes somewhere safe, like a password
                  manager. Each works once, if you can't use your authenticator
                  app. They won't be shown again.
                </DialogDescription>
              </DialogHeader>
              {flow.codes.length > 0 ? (
                <>
                  <ul
                    aria-label="Backup codes"
                    className="bg-muted/40 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border px-5 py-4 font-mono text-sm"
                  >
                    {flow.codes.map((backupCode) => (
                      <li
                        className="text-center tracking-wider tabular-nums"
                        key={backupCode}
                      >
                        {backupCode.slice(0, 5)}
                        <span className="text-muted-foreground">-</span>
                        {backupCode.slice(6)}
                      </li>
                    ))}
                  </ul>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() =>
                        copy(flow.codes.join("\n"), "Backup codes")
                      }
                      type="button"
                      variant="outline"
                    >
                      <Copy className="size-4" />
                      Copy
                    </Button>
                    <Button
                      onClick={() =>
                        download(
                          backupCodesText({
                            codes: flow.codes,
                            email,
                            createdAt: new Date(),
                          }),
                          "qrdx-backup-codes.txt",
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      <DocumentDownload className="size-4" />
                      Download
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={saved}
                      className="relative after:absolute after:-inset-3"
                      id={`${id}-saved`}
                      onCheckedChange={(checked) => setSaved(checked === true)}
                    />
                    <Label
                      className="-my-3 min-h-10 py-3 text-sm font-normal"
                      htmlFor={`${id}-saved`}
                    >
                      I've saved my backup codes
                    </Label>
                  </div>
                </>
              ) : (
                <p className="text-sm text-pretty">
                  Your backup codes couldn't be shown. Choose New backup codes
                  to make a fresh set.
                </p>
              )}
              <DialogFooter>
                <Button
                  disabled={flow.codes.length > 0 && !saved}
                  onClick={close}
                  type="button"
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}

          {flow.kind === "verify" && (
            <form className="space-y-4" noValidate onSubmit={verify}>
              <DialogHeader>
                <DialogTitle>
                  {flow.purpose === "off"
                    ? "Turn off two-step verification?"
                    : "Make new backup codes?"}
                </DialogTitle>
                <DialogDescription className="text-pretty">
                  {flow.purpose === "off"
                    ? "Signing in will no longer ask for a code from your app, and your backup codes stop working. Enter a code to confirm."
                    : "Your current backup codes stop working. Enter a code to confirm."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor={`${id}-code`}>
                  Code from your authenticator app, or a backup code
                </Label>
                <Input
                  aria-describedby={errorId}
                  aria-invalid={Boolean(error)}
                  autoCapitalize="none"
                  autoComplete="one-time-code"
                  autoCorrect="off"
                  autoFocus
                  className="font-mono"
                  disabled={busy}
                  id={`${id}-code`}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setError(null);
                  }}
                  placeholder="123456"
                  spellCheck={false}
                  value={code}
                />
                {errorLine}
              </div>
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
                  disabled={busy || !code.trim()}
                  type="submit"
                  variant={flow.purpose === "off" ? "destructive" : "default"}
                >
                  {busy && <Spinner className="animate-spin" />}
                  {flow.purpose === "off" ? "Turn off" : "Make new codes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
