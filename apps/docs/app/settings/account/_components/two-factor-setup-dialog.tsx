"use client";

import { addPasskeyWith } from "@repo/auth/passkey-client";
import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
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
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { cn } from "@repo/design-system/lib/utils";
import { Copy, FingerScan, Mobile } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { QRCode } from "qrdx";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { DialogCloseButton } from "@/components/confirm-identity/dialog-close-button";
import { useConfirmation } from "@/components/confirm-identity/provider";
import {
  getPasskeyAssertion,
  PasskeyPromptError,
} from "@/components/confirm-identity/webauthn";
import {
  CONFIRMATION_MESSAGES,
  type ConfirmationAction,
  needsConfirmation,
} from "@/lib/account/confirmation";
import {
  browserFailureMessage,
  defaultPasskeyName,
  MAX_PASSKEY_NAME_LENGTH,
  PASSKEY_MESSAGES,
} from "@/lib/account/passkeys";
import type { TwoFactorResult } from "@/lib/account/two-factor-manage";
import { groupSecret, TWO_FACTOR_MESSAGES } from "@/lib/auth/two-factor";
import {
  type AddedPasskey,
  addPasskey,
  type PasskeyActionResult,
  passkeyRegistrationOptions,
} from "../_lib/passkey-actions";
import {
  existingPasskeyOptions,
  startAuthenticatorSetup,
  turnOnWithExistingPasskey,
} from "../_lib/two-factor-actions";
import { BackupCodesList, copyText } from "./backup-codes";

const CODE_LENGTH = 6;
const DIGITS_ONLY = "^\\d+$";

/** Where the dialog starts. */
export type SetupStart = "choose" | "passkey" | "app" | "existing-passkey";
type Step = SetupStart | "codes";

type PluginResult<T> =
  | { data: T; error: null }
  | { data: null; error: { code?: string; message: string; status: number } };

/** A server action's result in the shape the plugin's browser code expects. */
function toPluginResult<T>(
  result: PasskeyActionResult<T> | null,
): PluginResult<T> {
  if (result === null) {
    return {
      data: null,
      error: { code: "CONFIRMATION_CANCELLED", message: "", status: 400 },
    };
  }
  if (result.ok) return { data: (result as { data: T }).data, error: null };
  return {
    data: null,
    error: {
      code: result.reason === "reauth" ? "SESSION_NOT_FRESH" : result.code,
      message: result.error,
      status: 400,
    },
  };
}

/**
 * Confirming the authenticator app can swap the session, so it goes through
 * a route handler rather than a server action (lib/account/two-factor-manage.ts).
 */
async function confirmApp(
  code: string,
): Promise<TwoFactorResult<{ backupCodes: string[] | null }>> {
  try {
    const response = await fetch("/api/account/two-factor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "confirm", code }),
    });
    if (!response.ok) return { ok: false, error: TWO_FACTOR_MESSAGES.failed };
    return (await response.json()) as TwoFactorResult<{
      backupCodes: string[] | null;
    }>;
  } catch {
    return { ok: false, error: TWO_FACTOR_MESSAGES.failed };
  }
}

/**
 * Turning two-step verification on (a stepper: choose a method, set it up,
 * save the backup codes) and adding a second method (the setup step alone).
 * Every server step needs a recent "Confirm it's you"; the settings asked
 * before opening this, and an expired confirmation asks again here.
 */
export function TwoFactorSetupDialog({
  start,
  turningOn,
  passkeysUsable,
  email,
  onClose,
}: {
  /** Null while closed */
  start: SetupStart | null;
  /** Two-step verification is off: this turns it on and shows backup codes */
  turningOn: boolean;
  /** Passkeys work in this browser and on this page */
  passkeysUsable: boolean;
  email: string;
  onClose: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [step, setStep] = useState<Step>("choose");
  const [choice, setChoice] = useState<"passkey" | "app">("passkey");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [setup, setSetup] = useState<{
    totpUri: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const open = start !== null;

  const action: ConfirmationAction = turningOn
    ? "turn-on-two-factor"
    : step === "app"
      ? "add-authenticator"
      : "add-passkey";

  const finish = (message?: string) => {
    if (message) toast.success(message);
    onClose();
    router.refresh();
  };

  const showCodes = (backupCodes: string[]) => {
    setCodes(backupCodes);
    setSaved(false);
    setError(null);
    setStep("codes");
  };

  // ── App: a new secret, then the first code from it ─────────────────────────
  const beginApp = async () => {
    setStep("app");
    setSetup(null);
    setCode("");
    setBusy(true);
    setError(null);
    try {
      const result = await withConfirmation(
        () => startAuthenticatorSetup(),
        action === "add-passkey" ? "add-authenticator" : action,
      );
      if (result === null) {
        onClose();
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSetup({ totpUri: result.totpUri, secret: result.secret });
    } finally {
      setBusy(false);
    }
  };

  const verifyApp = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await withConfirmation(() => confirmApp(value), action);
      if (result === null) return;
      if (!result.ok) {
        setCode("");
        setError(result.error);
        if (result.reason === "restart") setSetup(null);
        return;
      }
      setCode("");
      if (result.backupCodes) showCodes(result.backupCodes);
      else finish("Authenticator app added");
    } finally {
      setBusy(false);
    }
  };

  // ── Passkey: name, then the browser's prompt ───────────────────────────────
  const addNewPasskey = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    let serverMessage: string | null = null;
    let cancelled = false;
    const fromServer = <T,>(result: PasskeyActionResult<T> | null) => {
      if (result === null) cancelled = true;
      else if (!result.ok) serverMessage = result.error;
      return toPluginResult(result);
    };
    try {
      const { data, error: failure } = await addPasskeyWith(
        {
          options: async () =>
            fromServer(
              await withConfirmation(
                () => passkeyRegistrationOptions(),
                action,
              ),
            ),
          verify: async (body) =>
            fromServer(await withConfirmation(() => addPasskey(body), action)),
        },
        { name: name.trim() || undefined },
      );
      if (failure) {
        if (!cancelled) {
          setError(
            serverMessage ??
              browserFailureMessage(
                "code" in failure ? (failure.code as string) : undefined,
              ),
          );
        }
        return;
      }
      const added = data as unknown as AddedPasskey;
      if (added.backupCodes) {
        showCodes(added.backupCodes);
      } else if (added.turnOnFailed) {
        toast.error(
          "Passkey added, but two-step verification didn't turn on. Try Turn on again.",
        );
        finish();
      } else {
        finish("Passkey added");
      }
    } catch (failure) {
      console.error("Adding a passkey failed:", failure);
      setError(PASSKEY_MESSAGES.failed);
    } finally {
      setBusy(false);
    }
  };

  // ── An existing passkey turns it on (the legacy "ready" state) ─────────────
  const promptExistingPasskey = async (automatic: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await withConfirmation(
        () => existingPasskeyOptions(),
        "turn-on-two-factor",
      );
      if (started === null) return;
      if (!started.ok) {
        setError(started.error);
        return;
      }
      let response: Awaited<ReturnType<typeof getPasskeyAssertion>>;
      try {
        response = await getPasskeyAssertion(
          started.options as unknown as Parameters<
            typeof getPasskeyAssertion
          >[0],
        );
      } catch (failure) {
        const reason =
          failure instanceof PasskeyPromptError ? failure.reason : "failed";
        if (automatic && reason === "not-allowed") return;
        setError(
          reason === "not-allowed"
            ? CONFIRMATION_MESSAGES.passkeyClosed
            : CONFIRMATION_MESSAGES.passkeyFailed,
        );
        return;
      }
      const result = await withConfirmation(
        () => turnOnWithExistingPasskey({ response }),
        "turn-on-two-factor",
      );
      if (result === null) return;
      if (!result.ok) {
        setError(
          needsConfirmation(result)
            ? CONFIRMATION_MESSAGES.stillRequired
            : result.error,
        );
        return;
      }
      showCodes(result.backupCodes);
    } finally {
      setBusy(false);
    }
  };

  // Each opening starts fresh, then begins the first step: a new secret for
  // the app, or the passkey prompt (on its own once; the button repeats it).
  // The latest values through a ref, so this runs once per opening.
  const latest = useRef({ beginApp, promptExistingPasskey, passkeysUsable });
  latest.current = { beginApp, promptExistingPasskey, passkeysUsable };
  useEffect(() => {
    if (!start) return;
    setStep(start);
    setChoice(latest.current.passkeysUsable ? "passkey" : "app");
    setBusy(false);
    setError(null);
    setName(defaultPasskeyName(navigator.userAgent));
    setSetup(null);
    setCode("");
    setCodes([]);
    setSaved(false);
    if (start === "app") void latest.current.beginApp();
    if (start === "existing-passkey") {
      void latest.current.promptExistingPasskey(true);
    }
  }, [start]);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const steps: Step[] = turningOn
    ? start === "choose"
      ? ["choose", choice, "codes"]
      : [start ?? "choose", "codes"]
    : [start ?? "choose"];
  const stepNumber = Math.max(0, steps.indexOf(step)) + 1;

  const close = () => {
    if (busy) return;
    // After the codes, the page shows the new state.
    if (step === "codes") finish();
    else onClose();
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
        if (!next) close();
      }}
      open={open}
    >
      <DialogContent
        className="gap-5 max-sm:[&_[data-slot=button]]:h-10 max-sm:[&_[data-slot=input]]:h-10 sm:max-w-md"
        onEscapeKeyDown={(event) => {
          if (step === "codes" && codes.length > 0 && !saved) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (busy || step === "codes") event.preventDefault();
        }}
        showCloseButton={false}
      >
        {step !== "codes" && <DialogCloseButton disabled={busy} />}
        <DialogHeader>
          {steps.length > 1 && (
            <p className="text-muted-foreground text-xs font-medium tabular-nums">
              Step {stepNumber} of {steps.length}
            </p>
          )}
          <DialogTitle>
            {step === "choose"
              ? "Turn on two-step verification"
              : step === "passkey"
                ? "Add a passkey"
                : step === "app"
                  ? "Set up your authenticator app"
                  : step === "existing-passkey"
                    ? "Use your passkey"
                    : "Save your backup codes"}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {step === "choose"
              ? "After you sign in, QRdx will also ask for this. Pick one now; you can add the other later."
              : step === "passkey"
                ? turningOn
                  ? "Name it so you can tell your passkeys apart. Your browser then asks where to save it. Adding it turns on two-step verification."
                  : "Name it so you can tell your passkeys apart. Your browser then asks where to save it."
                : step === "app"
                  ? "Scan this QR code with your authenticator app, then enter the 6-digit code it shows."
                  : step === "existing-passkey"
                    ? "Use one of your passkeys to turn on two-step verification. After you sign in, QRdx will ask for it."
                    : "Each code works once, if you can't use your passkey or authenticator app. Keep them somewhere safe, like a password manager. They won't be shown again."}
          </DialogDescription>
        </DialogHeader>

        {step === "choose" && (
          <>
            <RadioGroup
              aria-label="Method"
              className="gap-2"
              onValueChange={(value) => setChoice(value as "passkey" | "app")}
              value={choice}
            >
              {(
                [
                  {
                    value: "passkey",
                    Icon: FingerScan,
                    title: "Passkey",
                    detail: passkeysUsable
                      ? "Touch ID, Face ID, Windows Hello or a security key."
                      : PASSKEY_MESSAGES.notSupported,
                    disabled: !passkeysUsable,
                  },
                  {
                    value: "app",
                    Icon: Mobile,
                    title: "Authenticator app",
                    detail: "An app that shows 6-digit codes.",
                    disabled: false,
                  },
                ] as const
              ).map(({ value, Icon, title, detail, disabled }) => (
                <Label
                  className={cn(
                    "has-[[data-state=checked]]:border-foreground/40 has-[[data-state=checked]]:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                  htmlFor={`${id}-${value}`}
                  key={value}
                >
                  <RadioGroupItem
                    className="mt-0.5"
                    disabled={disabled}
                    id={`${id}-${value}`}
                    value={value}
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {title}
                      {value === "passkey" && passkeysUsable && (
                        <Badge variant="secondary">Recommended</Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground block text-xs text-pretty">
                      {detail}
                    </span>
                  </span>
                  <Icon aria-hidden className="text-muted-foreground size-5" />
                </Label>
              ))}
            </RadioGroup>
            <DialogFooter>
              <Button onClick={onClose} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                onClick={() =>
                  choice === "app" ? void beginApp() : setStep("passkey")
                }
                type="button"
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "passkey" && (
          <form className="space-y-4" onSubmit={addNewPasskey}>
            <div className="space-y-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input
                aria-describedby={`${id}-error`}
                autoComplete="off"
                disabled={busy}
                id={`${id}-name`}
                maxLength={MAX_PASSKEY_NAME_LENGTH}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                value={name}
              />
            </div>
            {busy && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Spinner className="size-3.5 animate-spin" />
                Follow the prompt from your browser or device.
              </p>
            )}
            {errorLine}
            <DialogFooter>
              <Button
                disabled={busy}
                onClick={() =>
                  start === "choose" ? setStep("choose") : onClose()
                }
                type="button"
                variant="outline"
              >
                {start === "choose" ? "Back" : "Cancel"}
              </Button>
              <Button disabled={busy} type="submit">
                {busy && <Spinner className="animate-spin" />}
                Continue
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "app" && (
          <>
            {setup ? (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-xl border bg-white p-3">
                  <QRCode
                    bodyPattern="square"
                    cornerEyeDotPattern="square"
                    cornerEyePattern="square"
                    level="M"
                    size={168}
                    value={setup.totpUri}
                  />
                </div>
                <div className="w-full space-y-1.5">
                  <p className="text-muted-foreground text-xs">
                    Can't scan it? Enter this key in the app instead.
                  </p>
                  <div className="bg-muted/50 flex items-center gap-2 rounded-md border px-3 py-2">
                    <code className="min-w-0 flex-1 font-mono text-xs break-normal">
                      {groupSecret(setup.secret)}
                    </code>
                    <Button
                      aria-label="Copy the key"
                      className="size-10"
                      onClick={() => copyText(setup.secret, "Key")}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <InputOTP
                  aria-describedby={`${id}-error`}
                  aria-label="Code from your authenticator app"
                  autoComplete="one-time-code"
                  containerClassName="justify-center gap-3"
                  disabled={busy}
                  inputMode="numeric"
                  maxLength={CODE_LENGTH}
                  onChange={(value) => {
                    setCode(value);
                    if (value) setError(null);
                  }}
                  onComplete={(value) => void verifyApp(value)}
                  pattern={DIGITS_ONLY}
                  value={code}
                >
                  {[0, 3].map((first) => (
                    <InputOTPGroup key={first}>
                      {[first, first + 1, first + 2].map((index) => (
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
                <div className="flex min-h-5 items-center justify-center">
                  {busy ? (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <Spinner className="size-3.5 animate-spin" />
                      Checking code…
                    </p>
                  ) : (
                    errorLine
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3">
                {busy ? (
                  <Spinner className="text-muted-foreground size-5 animate-spin" />
                ) : (
                  <>
                    {errorLine}
                    <Button
                      onClick={() => void beginApp()}
                      type="button"
                      variant="outline"
                    >
                      Try again
                    </Button>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                disabled={busy}
                onClick={() =>
                  start === "choose" ? setStep("choose") : onClose()
                }
                type="button"
                variant="outline"
              >
                {start === "choose" ? "Back" : "Cancel"}
              </Button>
              <Button
                disabled={busy || !setup || code.length !== CODE_LENGTH}
                onClick={() => void verifyApp(code)}
                type="button"
              >
                Verify
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "existing-passkey" && (
          <>
            <div className="flex flex-col items-center gap-3 py-1 text-center">
              <span className="bg-muted/60 flex size-11 items-center justify-center rounded-full border">
                <FingerScan aria-hidden className="size-5" />
              </span>
              <p className="text-muted-foreground text-xs text-pretty">
                {busy
                  ? "Follow the prompt from your browser or device."
                  : "Touch ID, Face ID, Windows Hello or a security key."}
              </p>
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => void promptExistingPasskey(false)}
                type="button"
              >
                {busy && <Spinner className="animate-spin" />}
                Continue with passkey
              </Button>
              {errorLine}
            </div>
            <DialogFooter className="sm:justify-between">
              <Button
                disabled={busy}
                onClick={() => void beginApp()}
                type="button"
                variant="ghost"
              >
                Use an authenticator app instead
              </Button>
              <Button
                disabled={busy}
                onClick={onClose}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "codes" && (
          <>
            <BackupCodesList
              codes={codes}
              email={email}
              onSavedChange={setSaved}
              saved={saved}
            />
            <DialogFooter>
              <Button
                disabled={codes.length > 0 && !saved}
                onClick={() => finish("Two-step verification is on")}
                type="button"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
