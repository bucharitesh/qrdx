"use client";

import { authClient } from "@repo/auth/client";
import { addPasskeyWith } from "@repo/auth/passkey-client";
import { toast } from "@repo/design-system";
import { Close, Spinner } from "@repo/design-system/components/icons";
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Cloud, Key } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useState } from "react";
import {
  browserFailureMessage,
  defaultPasskeyName,
  MAX_PASSKEY_NAME_LENGTH,
  PASSKEY_MESSAGES,
  type PasskeyView,
} from "@/lib/account/passkeys";
import { secondFactorCodeKind } from "@/lib/auth/two-factor";
import { browserHasPasskeys } from "@/lib/passkeys";
import {
  addPasskey,
  type PasskeyActionResult,
  passkeyRegistrationOptions,
  removePasskey,
  renamePasskey,
} from "../_lib/passkey-actions";
import { SettingsSection } from "./settings-section";

// Tap targets of at least 40 px on phones; from `sm` up the settings keep
// their compact sizes (Button sm / default, Input).
const TAP_SM = "h-10 sm:h-8";
const TAP = "h-10 sm:h-9";

/**
 * The dialogs' close (×) with a 40 px target on phones (the dialog's own is
 * the 16 px icon), in the same corner.
 */
function DialogCloseButton({ disabled }: { disabled?: boolean }) {
  return (
    <DialogClose asChild>
      <Button
        aria-label="Close"
        className="text-muted-foreground hover:text-foreground absolute top-1 right-1 size-10 sm:top-2 sm:right-2 sm:size-8"
        disabled={disabled}
        size="icon-sm"
        variant="ghost"
      >
        <Close className="size-4" />
      </Button>
    </DialogClose>
  );
}

type PluginResult<T> =
  | { data: T; error: null }
  | { data: null; error: { code?: string; message: string; status: number } };

/** A server action's result in the shape the plugin's browser code expects. */
function toPluginResult<T>(result: PasskeyActionResult<T>): PluginResult<T> {
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

function AddPasskeyDialog({
  open,
  onOpenChange,
  recentSignIn,
  twoFactorOn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recentSignIn: boolean;
  /** Two-step verification is on: a current code is needed (server-checked) */
  twoFactorOn: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [name, setName] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [mustSignInAgain, setMustSignInAgain] = useState(!recentSignIn);

  // A fresh default each time it opens: the browser and OS, like Sessions.
  useEffect(() => {
    if (!open) return;
    setName(defaultPasskeyName(navigator.userAgent));
    setTwoFactorCode("");
    setError(null);
  }, [open]);

  const codeReady =
    !twoFactorOn || secondFactorCodeKind(twoFactorCode) !== null;

  const close = () => {
    if (!adding) onOpenChange(false);
  };

  const signOutToReauth = async () => {
    await authClient.signOut().catch(() => {});
    router.push("/");
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (adding || !codeReady) return;
    setAdding(true);
    setError(null);
    let serverMessage: string | null = null;
    const fromServer = <T,>(result: PasskeyActionResult<T>) => {
      if (!result.ok) {
        serverMessage = result.error;
        if (result.reason === "reauth") setMustSignInAgain(true);
      }
      return toPluginResult(result);
    };
    try {
      const { error: failure } = await addPasskeyWith(
        {
          options: async () =>
            fromServer(
              await passkeyRegistrationOptions(
                twoFactorOn ? { twoFactorCode } : undefined,
              ),
            ),
          verify: async (body) => fromServer(await addPasskey(body)),
        },
        { name: name.trim() || undefined },
      );
      if (failure) {
        setError(
          serverMessage ??
            browserFailureMessage("code" in failure ? failure.code : undefined),
        );
        return;
      }
      toast.success("Passkey added");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("Adding a passkey failed:", err);
      setError(PASSKEY_MESSAGES.failed);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogCloseButton disabled={adding} />
        <DialogHeader>
          <DialogTitle>Add a passkey</DialogTitle>
          <DialogDescription className="text-pretty">
            {mustSignInAgain
              ? PASSKEY_MESSAGES.reauth
              : "Your browser will ask where to save it: this device, your phone, or a password manager."}
          </DialogDescription>
        </DialogHeader>

        {mustSignInAgain ? (
          <DialogFooter>
            <Button
              className={TAP}
              onClick={close}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button className={TAP} onClick={signOutToReauth} type="button">
              Sign out
            </Button>
          </DialogFooter>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input
                className={TAP}
                aria-describedby={`${id}-hint ${id}-error`}
                autoComplete="off"
                disabled={adding}
                id={`${id}-name`}
                maxLength={MAX_PASSKEY_NAME_LENGTH}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                value={name}
              />
              <p className="text-muted-foreground text-xs" id={`${id}-hint`}>
                So you can tell your passkeys apart later.
              </p>
            </div>
            {twoFactorOn && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-code`}>
                  Code from your authenticator app, or a backup code
                </Label>
                <Input
                  aria-describedby={`${id}-code-hint ${id}-error`}
                  autoCapitalize="none"
                  autoComplete="one-time-code"
                  autoCorrect="off"
                  className={`${TAP} font-mono`}
                  disabled={adding}
                  id={`${id}-code`}
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
                  id={`${id}-code-hint`}
                >
                  Two-step verification is on, so adding a passkey needs a code.
                  A backup code is used up.
                </p>
              </div>
            )}
            <p
              aria-live="polite"
              className="text-destructive text-sm text-pretty empty:hidden"
              id={`${id}-error`}
              role={error ? "alert" : undefined}
            >
              {error}
            </p>
            <DialogFooter>
              <Button
                className={TAP}
                disabled={adding}
                onClick={close}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className={TAP}
                disabled={adding || !codeReady}
                type="submit"
              >
                {adding && <Spinner className="animate-spin" />}
                Continue
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenamePasskeyDialog({
  passkey,
  onClose,
}: {
  passkey: PasskeyView | null;
  onClose: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!passkey) return;
    setName(passkey.name);
    setError(null);
  }, [passkey]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passkey || saving) return;
    setSaving(true);
    try {
      const result = await renamePasskey({ id: passkey.id, name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Passkey renamed");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!(next || saving)) onClose();
      }}
      open={passkey !== null}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogCloseButton disabled={saving} />
        <DialogHeader>
          <DialogTitle>Rename passkey</DialogTitle>
          <DialogDescription>
            Only you see this name, here in your settings.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              className={TAP}
              aria-describedby={`${id}-error`}
              autoComplete="off"
              disabled={saving}
              id={`${id}-name`}
              maxLength={MAX_PASSKEY_NAME_LENGTH}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              value={name}
            />
          </div>
          <p
            aria-live="polite"
            className="text-destructive text-sm text-pretty empty:hidden"
            id={`${id}-error`}
            role={error ? "alert" : undefined}
          >
            {error}
          </p>
          <DialogFooter>
            <Button
              className={TAP}
              disabled={saving}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className={TAP}
              disabled={saving || !name.trim()}
              type="submit"
            >
              {saving && <Spinner className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PasskeysList({
  passkeys,
  recentSignIn,
  twoFactorOn,
}: {
  passkeys: PasskeyView[];
  recentSignIn: boolean;
  twoFactorOn: boolean;
}) {
  const router = useRouter();
  // Unknown until mounted; the button stays disabled until then.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<PasskeyView | null>(null);
  const [removing, setRemoving] = useState<PasskeyView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(browserHasPasskeys());
  }, []);

  const confirmRemove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const result = await removePasskey({ id: removing.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Removed ${removing.name}`);
      setRemoving(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      action={
        <Button
          className={TAP_SM}
          disabled={!supported}
          onClick={() => setAdding(true)}
          size="sm"
          title={
            supported === false ? PASSKEY_MESSAGES.notSupported : undefined
          }
          variant="outline"
        >
          Add passkey
        </Button>
      }
      description="Sign in with your fingerprint, face or screen lock instead of a code. Passkeys can't be phished or guessed."
      id="passkeys"
      title="Passkeys"
    >
      <ul className="divide-y">
        {passkeys.length === 0 && (
          <li className="text-muted-foreground px-5 py-4 text-sm sm:px-6">
            {supported === false
              ? `No passkeys yet. ${PASSKEY_MESSAGES.notSupported}`
              : "No passkeys yet."}
          </li>
        )}
        {passkeys.map((passkey) => {
          const Icon = passkey.synced ? Cloud : Key;
          const details = [passkey.added, passkey.provider].filter(Boolean);
          return (
            // On phones the actions get their own line under the details, so
            // the name and date aren't squeezed into a narrow column.
            <li
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 sm:flex-nowrap sm:gap-4 sm:px-6"
              key={passkey.id}
            >
              <span className="bg-muted/60 flex size-9 shrink-0 items-center justify-center rounded-full border">
                <Icon aria-hidden className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium break-words">
                    {passkey.name}
                  </p>
                  <Badge variant="secondary">
                    {passkey.synced ? "Synced" : "Device-bound"}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {details.join(" · ")}
                </p>
              </div>
              <div className="flex w-full shrink-0 gap-1 pl-9 sm:w-auto sm:pl-0">
                <Button
                  className={TAP_SM}
                  disabled={busy}
                  onClick={() => setRenaming(passkey)}
                  size="sm"
                  variant="ghost"
                >
                  Rename
                </Button>
                <Button
                  className={TAP_SM}
                  disabled={busy}
                  onClick={() => setRemoving(passkey)}
                  size="sm"
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <AddPasskeyDialog
        onOpenChange={setAdding}
        open={adding}
        recentSignIn={recentSignIn}
        twoFactorOn={twoFactorOn}
      />
      <RenamePasskeyDialog
        onClose={() => setRenaming(null)}
        passkey={renaming}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!(open || busy)) setRemoving(null);
        }}
        open={removing !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It won't sign in to QRdx anymore. Your device or password manager
              may still list it until you delete it there too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={TAP} disabled={busy}>
              Cancel
            </AlertDialogCancel>
            <Button
              className={TAP}
              disabled={busy}
              onClick={confirmRemove}
              variant="outline"
            >
              {busy && <Spinner className="animate-spin" />}
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
