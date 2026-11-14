"use client";

import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  DocumentText,
  FingerScan,
  Mobile,
  More,
  ShieldTick,
} from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { FeatureSpotlight } from "@/components/app-shell/feature-spotlight";
import { ensureConfirmed } from "@/components/confirm-identity/actions";
import { useConfirmation } from "@/components/confirm-identity/provider";
import type { ConfirmationAction } from "@/lib/account/confirmation";
import { PASSKEY_MESSAGES, type PasskeyView } from "@/lib/account/passkeys";
import {
  passkeyReadyForTwoFactor,
  removalTurnsOff,
  type TwoFactorMethods,
} from "@/lib/account/two-factor-methods";
import { BACKUP_CODE_COUNT } from "@/lib/auth/two-factor";
import type { Translator } from "@/lib/i18n/translator";
import { browserHasPasskeys } from "@/lib/passkeys";
import { removePasskey } from "../_lib/passkey-actions";
import {
  regenerateBackupCodes,
  removeAuthenticatorApp,
  turnOffTwoFactor,
} from "../_lib/two-factor-actions";
import { BackupCodesList } from "./backup-codes";
import { RenamePasskeyDialog } from "./rename-passkey-dialog";
import { SettingsSection } from "./settings-section";
import { TwoFactorResetNotice } from "./two-factor-reset-notice";
import {
  type SetupStart,
  TwoFactorSetupDialog,
} from "./two-factor-setup-dialog";

// Tap targets of at least 40 px on phones; from `sm` up the settings keep
// their compact sizes.
const TAP_SM = "h-10 sm:h-8";

/** One method or status line: icon, title and details, then its buttons. */
function MethodRow({
  icon,
  title,
  badge,
  details,
  actions,
}: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  details: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // On phones the buttons sit under the text, so it keeps its width.
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <span className="bg-muted/60 flex size-9 shrink-0 items-center justify-center rounded-full border">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{title}</p>
            {badge}
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
            {details}
          </p>
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap gap-2 pl-12 sm:shrink-0 sm:justify-end sm:pl-0">
          {actions}
        </div>
      )}
    </div>
  );
}

/** "After you sign in, QRdx asks for your passkey or …". */
function statusDetails(
  methods: TwoFactorMethods,
  ready: boolean,
  t: Translator<"app.settings.account.twoFactorSettings">,
): string {
  if (!methods.on) {
    return ready ? t("yourPasskeyIsReadyTo") : t("addAPasskeyOrAn");
  }
  if (methods.passkeys > 0 && methods.authenticatorApp) {
    return t("afterYouSignInPasskeyOrApp");
  }
  if (methods.passkeys > 0) return t("afterYouSignInPasskey");
  if (methods.authenticatorApp) return t("afterYouSignInApp");
  return t("afterYouSignInQrdx2");
}

type Confirming =
  | { kind: "turn-off" }
  | { kind: "remove-app" }
  | { kind: "new-codes" }
  | { kind: "remove-passkey"; passkey: PasskeyView };

export function TwoFactorSettings({
  methods,
  passkeys,
  passkeysHere,
  email,
  resetDueDate = null,
}: {
  methods: TwoFactorMethods;
  passkeys: PasskeyView[];
  /** The deployment and this page's origin can use passkeys */
  passkeysHere: boolean;
  email: string;
  /** Support's turn-off is waiting: the day it happens */
  resetDueDate?: string | null;
}) {
  const t = useTranslations("app.settings.account.twoFactorSettings");
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  // Unknown until mounted; passkey buttons stay disabled until then.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [setupStart, setSetupStart] = useState<SetupStart | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<PasskeyView | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSupported(browserHasPasskeys());
  }, []);

  const passkeysUsable = passkeysHere && supported === true;
  const ready = passkeysUsable && passkeyReadyForTwoFactor(methods);
  const left = methods.backupCodesLeft;

  /** Asks "Confirm it's you" before a flow with several steps. */
  const openSetup = async (
    start: SetupStart,
    action: ConfirmationAction,
    opener: string,
  ) => {
    setOpening(opener);
    try {
      const result = await withConfirmation(() => ensureConfirmed(), action);
      if (result === null) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSetupStart(start);
    } finally {
      setOpening(null);
    }
  };

  const turnOn = () =>
    openSetup(
      ready ? "existing-passkey" : passkeysUsable ? "choose" : "app",
      "turn-on-two-factor",
      "turn-on",
    );

  const closeSetup = useCallback(() => setSetupStart(null), []);

  const runConfirmed = async () => {
    if (!confirming || busy) return;
    setBusy(true);
    try {
      if (confirming.kind === "turn-off") {
        const result = await withConfirmation(
          () => turnOffTwoFactor(),
          "turn-off-two-factor",
        );
        if (result === null) return;
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(t("twoStepVerificationIsOff"));
      } else if (confirming.kind === "remove-app") {
        const result = await withConfirmation(
          () => removeAuthenticatorApp(),
          "remove-authenticator",
        );
        if (result === null) return;
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(
          result.turnedOff
            ? t("authenticatorAppRemovedTwoStep")
            : t("authenticatorAppRemoved"),
        );
      } else if (confirming.kind === "new-codes") {
        const result = await withConfirmation(
          () => regenerateBackupCodes(),
          "backup-codes",
        );
        if (result === null) return;
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setConfirming(null);
        setSaved(false);
        setNewCodes(result.backupCodes);
        return;
      } else {
        const { passkey } = confirming;
        const result = await withConfirmation(
          () => removePasskey({ id: passkey.id }),
          "remove-passkey",
        );
        if (result === null) return;
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(
          result.data.turnedOff
            ? t("removedNameTwoStepVerification", { name: passkey.name })
            : t("removedName", { name: passkey.name }),
        );
      }
      setConfirming(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const turnsOffNotice =
    "It's your only second step, so two-step verification turns off and your backup codes stop working.";
  const confirmCopy: Record<
    Confirming["kind"],
    { title: string; body: string; button: string; destructive: boolean }
  > = {
    "turn-off": {
      title: t("turnOffTwoStepVerification"),
      body: `Signing in will no longer ask for a second step, and your backup codes stop working.${methods.passkeys > 0 ? " Your passkeys stay, and still sign you in." : ""}`,
      button: "Turn off",
      destructive: true,
    },
    "remove-app": {
      title: t("removeYourAuthenticatorApp"),
      body: removalTurnsOff(methods, "authenticator")
        ? turnsOffNotice
        : "Signing in will ask for your passkey or a backup code instead. Delete QRdx from the app too.",
      button: "Remove",
      destructive: removalTurnsOff(methods, "authenticator"),
    },
    "new-codes": {
      title: t("makeNewBackupCodes"),
      body: "Your current backup codes stop working straight away.",
      button: "Make new codes",
      destructive: false,
    },
    "remove-passkey": {
      title:
        confirming?.kind === "remove-passkey"
          ? t("removeName", { name: confirming.passkey.name })
          : t("removePasskey"),
      body: removalTurnsOff(methods, "passkey")
        ? `It won't sign in to QRdx anymore. ${turnsOffNotice}`
        : "It won't sign in to QRdx anymore. Your device or password manager may still list it until you delete it there too.",
      button: "Remove",
      destructive: removalTurnsOff(methods, "passkey"),
    },
  };
  const copy = confirming ? confirmCopy[confirming.kind] : null;

  return (
    <SettingsSection
      description={t("afterYouSignInQrdx")}
      id="two-factor"
      title={t("twoStepVerification")}
    >
      {resetDueDate && <TwoFactorResetNotice dueDate={resetDueDate} />}

      <MethodRow
        actions={
          methods.on ? (
            <Button
              className={TAP_SM}
              onClick={() => setConfirming({ kind: "turn-off" })}
              size="sm"
              variant="outline"
            >
              {t("turnOff")}
            </Button>
          ) : (
            <Button
              className={TAP_SM}
              disabled={opening !== null || (ready && supported === null)}
              onClick={turnOn}
              size="sm"
              variant={ready ? "default" : "outline"}
            >
              {opening === "turn-on" && <ModuleOrbit aria-hidden />}
              {t("turnOn")}
            </Button>
          )
        }
        badge={
          <Badge variant={methods.on ? "secondary" : "outline"}>
            {methods.on ? t("on") : t("off")}
          </Badge>
        }
        details={statusDetails(methods, ready, t)}
        icon={<ShieldTick aria-hidden className="size-4" />}
        title={t("twoStepVerification")}
      />

      {passkeysHere && (
        <div className="scroll-mt-24" id="passkeys">
          <MethodRow
            actions={
              <FeatureSpotlight
                description={t("passkeySpotlight")}
                // Shown to people without a passkey, where adding one works.
                enabled={passkeysUsable && passkeys.length === 0}
                id="passkey-second-step"
                side="left"
              >
                <Button
                  className={TAP_SM}
                  disabled={!passkeysUsable || opening !== null}
                  onClick={() =>
                    openSetup(
                      "passkey",
                      methods.on ? "add-passkey" : "turn-on-two-factor",
                      "passkey",
                    )
                  }
                  size="sm"
                  title={
                    supported === false
                      ? PASSKEY_MESSAGES.notSupported
                      : undefined
                  }
                  variant="outline"
                >
                  {opening === "passkey" && <ModuleOrbit aria-hidden />}
                  {t("addPasskey")}
                </Button>
              </FeatureSpotlight>
            }
            details={
              supported === false
                ? PASSKEY_MESSAGES.notSupported
                : "Sign in with your fingerprint, face or screen lock. Each one also works as your second step."
            }
            icon={<FingerScan aria-hidden className="size-4" />}
            title={t("passkeys")}
          />
          {passkeys.length === 0 ? (
            <p className="text-muted-foreground -mt-1 px-5 pb-4 text-xs sm:pr-6 sm:pl-[4.75rem]">
              {t("noPasskeysYet")}
            </p>
          ) : (
            <ul className="mx-5 mb-4 divide-y rounded-lg border sm:mr-6 sm:ml-[4.75rem]">
              {passkeys.map((passkey) => {
                const details = [passkey.added, passkey.provider].filter(
                  Boolean,
                );
                return (
                  <li
                    className="flex items-center gap-3 py-2.5 pr-2 pl-4"
                    key={passkey.id}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium break-words">
                          {passkey.name}
                        </p>
                        <Badge variant="outline">
                          {passkey.synced ? t("synced") : t("deviceBound")}
                        </Badge>
                      </div>
                      {details.length > 0 && (
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {details.join(" · ")}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={t("optionsForName", {
                            name: passkey.name,
                          })}
                          className="size-10 shrink-0 sm:size-8"
                          size="icon-sm"
                          variant="ghost"
                        >
                          <More className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setRenaming(passkey)}>
                          {t("rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            setConfirming({ kind: "remove-passkey", passkey })
                          }
                        >
                          {t("remove")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <MethodRow
        actions={
          methods.authenticatorApp ? (
            <Button
              className={TAP_SM}
              onClick={() => setConfirming({ kind: "remove-app" })}
              size="sm"
              variant="outline"
            >
              {t("remove")}
            </Button>
          ) : (
            <Button
              className={TAP_SM}
              disabled={opening !== null}
              onClick={() =>
                openSetup(
                  "app",
                  methods.on ? "add-authenticator" : "turn-on-two-factor",
                  "app",
                )
              }
              size="sm"
              variant="outline"
            >
              {opening === "app" && <ModuleOrbit aria-hidden />}
              {t("setUp")}
            </Button>
          )
        }
        details={
          methods.authenticatorApp
            ? "6-digit codes from the app on your phone or computer."
            : "Use any authenticator app that shows 6-digit codes."
        }
        icon={<Mobile aria-hidden className="size-4" />}
        title={t("authenticatorApp")}
      />

      {methods.on && (
        <MethodRow
          actions={
            <Button
              className={TAP_SM}
              onClick={() => setConfirming({ kind: "new-codes" })}
              size="sm"
              variant="outline"
            >
              {t("newCodes")}
            </Button>
          }
          details={
            left === null
              ? "For when you can't use your passkey or app. Each works once."
              : `${left} of ${BACKUP_CODE_COUNT} left. Each works once.${left <= 3 ? " Make new ones soon." : ""}`
          }
          icon={<DocumentText aria-hidden className="size-4" />}
          title={t("backupCodes")}
        />
      )}

      <TwoFactorSetupDialog
        email={email}
        onClose={closeSetup}
        passkeysUsable={passkeysUsable}
        start={setupStart}
        turningOn={!methods.on}
      />

      <RenamePasskeyDialog
        onClose={() => setRenaming(null)}
        passkey={renaming}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!(open || busy)) setConfirming(null);
        }}
        open={confirming !== null}
      >
        <AlertDialogContent className="max-sm:[&_[data-slot=alert-dialog-footer]_button]:h-10">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {copy?.body}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={runConfirmed}
              variant={copy?.destructive ? "destructive" : "outline"}
            >
              {busy && <ModuleOrbit aria-hidden />}
              {copy?.button}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open && (saved || newCodes?.length === 0)) {
            setNewCodes(null);
            router.refresh();
          }
        }}
        open={newCodes !== null}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("yourNewBackupCodes")}</DialogTitle>
            <DialogDescription className="text-pretty">
              {t("eachCodeWorksOnceIf")}
            </DialogDescription>
          </DialogHeader>
          <BackupCodesList
            codes={newCodes ?? []}
            email={email}
            onSavedChange={setSaved}
            saved={saved}
          />
          <DialogFooter>
            <Button
              className="h-10 sm:h-9"
              disabled={(newCodes?.length ?? 0) > 0 && !saved}
              onClick={() => {
                setNewCodes(null);
                router.refresh();
              }}
              type="button"
            >
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
