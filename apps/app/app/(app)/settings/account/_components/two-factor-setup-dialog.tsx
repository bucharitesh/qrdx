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
import { useTranslations } from "next-intl";
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
import type { Translator } from "@/lib/i18n/translator";
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
  t: Translator<"app.settings.account.twoFactorSetupDialog">,
): PluginResult<T> {
  if (result === null) {
    return {
      data: null,
      error: { code: t("confirmationCancelled"), message: "", status: 400 },
    };
  }
  if (result.ok) return { data: (result as { data: T }).data, error: null };
  return {
    data: null,
    error: {
      code: result.reason === "reauth" ? t("sessionNotFresh") : result.code,
      message: result.error,
      status: 400,
    },
  };
}

/**
 * Confirming the authenticator app can swap the session, so it goes through
 * a route handler rather than a server action (lib/account/two-factor-manage.ts).
 */
async function confirmApp(code: string): Promise<
  TwoFactorResult<{
    backupCodes: string[] | null;
    signedOutElsewhere?: boolean;
  }>
> {
  try {
    const response = await fetch("/api/account/two-factor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "confirm", code }),
    });
    if (!response.ok) return { ok: false, error: TWO_FACTOR_MESSAGES.failed };
    return (await response.json()) as TwoFactorResult<{
      backupCodes: string[] | null;
      signedOutElsewhere?: boolean;
    }>;
  } catch {
    return { ok: false, error: TWO_FACTOR_MESSAGES.failed };
  }
}

/** What turning it on says about the account's other devices. */
const SIGNED_OUT_ELSEWHERE = "Your other devices were signed out.";
const NOT_SIGNED_OUT_ELSEWHERE =
  "We couldn't sign out your other devices. Use Sign out everywhere else under Sessions.";

/**
 * Turning two-step verification on (a stepper: choose a method, set it up,
 * save the backup codes) and adding a second method (the setup step alone).
 * Turning it on signs out the account's other devices (the server does it;
 * this says so). Every server step needs a recent "Confirm it's you"; the
 * settings asked before opening this, and an expired confirmation asks
 * again here.
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
  const t = useTranslations("app.settings.account.twoFactorSetupDialog");
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
  /** Turned on: whether the other devices were signed out. */
  const [signedOutElsewhere, setSignedOutElsewhere] = useState(true);

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

  const showCodes = (backupCodes: string[], signedOut = true) => {
    setCodes(backupCodes);
    setSaved(false);
    setSignedOutElsewhere(signedOut);
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
      if (result.backupCodes) {
        showCodes(result.backupCodes, result.signedOutElsewhere !== false);
      } else finish("Authenticator app added");
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
      return toPluginResult(result, t);
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
        showCodes(added.backupCodes, added.signedOutElsewhere !== false);
      } else if (added.turnOnFailed) {
        toast.error(t("passkeyAddedButTwoStep"));
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
      showCodes(result.backupCodes, result.signedOutElsewhere);
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
    setSignedOutElsewhere(true);
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
              {t("stepStepnumberOfLength", {
                stepNumber,
                length: steps.length,
              })}
            </p>
          )}
          <DialogTitle>
            {step === "choose"
              ? t("turnOnTwoStepVerification")
              : step === "passkey"
                ? t("addAPasskey")
                : step === "app"
                  ? t("setUpYourAuthenticatorApp")
                  : step === "existing-passkey"
                    ? t("useYourPasskey")
                    : t("saveYourBackupCodes")}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {step === "choose"
              ? t("afterYouSignInQrdx")
              : step === "passkey"
                ? turningOn
                  ? t("nameItSoYouCan")
                  : t("nameItSoYouCan2")
                : step === "app"
                  ? turningOn && start === "app"
                    ? t("scanThisQrCodeWith")
                    : t("scanThisQrCodeWith2")
                  : step === "existing-passkey"
                    ? t("useOneOfYourPasskeys")
                    : t("eachCodeWorksOnceIf")}
          </DialogDescription>
        </DialogHeader>

        {step === "choose" && (
          <>
            <RadioGroup
              aria-label={t("method")}
              className="gap-2"
              onValueChange={(value) => setChoice(value as "passkey" | "app")}
              value={choice}
            >
              {(
                [
                  {
                    value: "passkey",
                    Icon: FingerScan,
                    title: t("passkey"),
                    detail: passkeysUsable
                      ? "Touch ID, Face ID, Windows Hello or a security key."
                      : PASSKEY_MESSAGES.notSupported,
                    disabled: !passkeysUsable,
                  },
                  {
                    value: "app",
                    Icon: Mobile,
                    title: t("authenticatorApp"),
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
                        <Badge variant="secondary">{t("recommended")}</Badge>
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
                {t("cancel")}
              </Button>
              <Button
                onClick={() =>
                  choice === "app" ? void beginApp() : setStep("passkey")
                }
                type="button"
              >
                {t("continue")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "passkey" && (
          <form className="space-y-4" onSubmit={addNewPasskey}>
            <div className="space-y-2">
              <Label htmlFor={`${id}-name`}>{t("name")}</Label>
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
                {t("followThePromptFromYour")}
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
                {start === "choose" ? t("back") : t("cancel")}
              </Button>
              <Button disabled={busy} type="submit">
                {busy && <Spinner className="animate-spin" />}
                {t("continue")}
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
                    {t("cantScanItEnterThis")}
                  </p>
                  <div className="bg-muted/50 flex items-center gap-2 rounded-md border px-3 py-2">
                    <code className="min-w-0 flex-1 font-mono text-xs break-normal">
                      {groupSecret(setup.secret)}
                    </code>
                    <Button
                      aria-label={t("copyTheKey")}
                      className="size-10"
                      onClick={() => copyText(setup.secret, "Key", t)}
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
                  aria-label={t("codeFromYourAuthenticatorApp")}
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
                      {t("checkingCode")}
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
                      {t("tryAgain")}
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
                {start === "choose" ? t("back") : t("cancel")}
              </Button>
              <Button
                disabled={busy || !setup || code.length !== CODE_LENGTH}
                onClick={() => void verifyApp(code)}
                type="button"
              >
                {t("verify")}
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
                  ? t("followThePromptFromYour")
                  : t("touchIdFaceIdWindows")}
              </p>
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => void promptExistingPasskey(false)}
                type="button"
              >
                {busy && <Spinner className="animate-spin" />}
                {t("continueWithPasskey")}
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
                {t("useAnAuthenticatorAppInstead")}
              </Button>
              <Button
                disabled={busy}
                onClick={onClose}
                type="button"
                variant="outline"
              >
                {t("cancel")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "codes" && (
          <>
            <p
              className={cn(
                "text-sm text-pretty",
                signedOutElsewhere
                  ? "text-muted-foreground"
                  : "text-destructive",
              )}
              role={signedOutElsewhere ? undefined : "alert"}
            >
              {t("twoStepVerificationIsOn")}{" "}
              {signedOutElsewhere
                ? SIGNED_OUT_ELSEWHERE
                : NOT_SIGNED_OUT_ELSEWHERE}
            </p>
            <BackupCodesList
              codes={codes}
              email={email}
              onSavedChange={setSaved}
              saved={saved}
            />
            <DialogFooter>
              <Button
                disabled={codes.length > 0 && !saved}
                onClick={() =>
                  finish(
                    signedOutElsewhere
                      ? `Two-step verification is on. ${SIGNED_OUT_ELSEWHERE}`
                      : "Two-step verification is on",
                  )
                }
                type="button"
              >
                {t("done")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
