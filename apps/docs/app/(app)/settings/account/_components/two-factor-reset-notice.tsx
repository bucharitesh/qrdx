"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { ShieldCross } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useConfirmation } from "@/components/confirm-identity/provider";
import { cancelSupportTwoFactorReset } from "../_lib/two-factor-reset-actions";

/**
 * At the top of Two-step verification while support's turn-off is waiting
 * (lib/account/two-factor-reset-server.ts): the day, and Cancel, which asks
 * "Confirm it's you".
 */
export function TwoFactorResetNotice({
  dueDate,
}: {
  /** "November 16, 2026" */
  dueDate: string;
}) {
  const t = useTranslations("app.settings.account.twoFactorResetNotice");
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    setBusy(true);
    try {
      const result = await withConfirmation(
        () => cancelSupportTwoFactorReset(),
        "cancel-two-factor-reset",
      );
      if (result === null) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("cancelledTwoStepVerificationStays"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="bg-muted/40 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
      role="status"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <span className="bg-background flex size-9 shrink-0 items-center justify-center rounded-full border">
          <ShieldCross aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-pretty">
            {t("supportWillTurnThisOff", { dueDate })}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
            {t("someoneAskedQrdxSupportTo")}
          </p>
        </div>
      </div>
      <div className="flex pl-12 sm:shrink-0 sm:pl-0">
        <Button
          className="h-10 sm:h-8"
          disabled={busy}
          onClick={cancel}
          size="sm"
          variant="outline"
        >
          {busy && <Spinner className="animate-spin" />}
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
