"use client";

import { resetAnalytics } from "@repo/analytics";
import { authClient } from "@repo/auth/client";
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
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Warning2 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { deleteAccount } from "@/actions/account";
import { useConfirmation } from "@/components/confirm-identity/provider";
import {
  DELETE_CONFIRMATION,
  type DeletionSummary,
  isDeleteConfirmed,
} from "@/lib/account/deletion";
import { SettingsRow, SettingsSection } from "./settings-section";

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
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: DeletionSummary;
}) {
  const t = useTranslations("app.settings.account.dangerZoneSection");
  const id = useId();
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    isDeleteConfirmed(confirmation) && summary.blockers.length === 0;

  const reset = () => {
    setConfirmation("");
    setError(null);
  };

  const confirmDelete = async () => {
    if (!ready || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      // Asks "Confirm it's you" first when this session hasn't recently.
      const result = await withConfirmation(
        () => deleteAccount({ confirmation }),
        "delete-account",
      );
      if (result === null) {
        setDeleting(false);
        return;
      }
      if (!result.ok) {
        setError(result.error);
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

  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (deleting) return;
        onOpenChange(next);
        if (!next) reset();
      }}
      open={open}
    >
      <AlertDialogContent
        // On phones the fields and buttons here are 40 px tap targets.
        className="max-sm:[&_[data-slot=alert-dialog-footer]_button]:h-10 max-sm:[&_[data-slot=input]]:h-10 sm:max-w-md"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteYourAccount")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("thisCantBeUndoneIf")}
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
              {t.rich("typeToConfirm", {
                word: DELETE_CONFIRMATION,
                code: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
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

          <p
            aria-live="polite"
            className="text-destructive text-sm text-pretty empty:hidden"
            role={error ? "alert" : undefined}
          >
            {error}
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} type="button">
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              disabled={!ready || deleting}
              type="submit"
              variant="destructive"
            >
              {deleting && <ModuleOrbit aria-hidden />}
              {t("deleteAccount")}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DangerZoneSection({ summary }: { summary: DeletionSummary }) {
  const t = useTranslations("app.settings.account.dangerZoneSection");
  const [open, setOpen] = useState(false);

  return (
    <SettingsSection
      description={t("permanentActionsOnYourAccount")}
      id="danger"
      title={t("dangerZone")}
      tone="danger"
    >
      <SettingsRow
        description={t("deleteYourAccountAndEverything")}
        label={t("deleteAccount")}
      >
        <div className="space-y-4">
          <Consequences items={summary.consequences} />
          {summary.blockers.length > 0 && <Blockers items={summary.blockers} />}
          <Button
            disabled={summary.blockers.length > 0}
            onClick={() => setOpen(true)}
            variant="destructive"
          >
            {t("deleteAccount2")}
          </Button>
        </div>
      </SettingsRow>

      <DeleteAccountDialog
        onOpenChange={setOpen}
        open={open}
        summary={summary}
      />
    </SettingsSection>
  );
}
