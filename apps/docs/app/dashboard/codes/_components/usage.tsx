"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Progress } from "@repo/design-system/components/ui/progress";
import { Diamonds as Gem, Add as Plus } from "iconsax-reactjs";
import type { ComponentProps } from "react";
import type { CodeUsage } from "@/app/dashboard/codes/_lib/qr-codes";
import { openCodeBuilder } from "@/components/code-builder/store";
import { PLAN_NAMES } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { formatNumber } from "./format";

const isAtLimit = (usage: CodeUsage) =>
  usage.limit !== null && usage.used >= usage.limit;

export function UsageMeter({ usage }: { usage: CodeUsage }) {
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );

  if (usage.limit === null) {
    return (
      <p className="text-muted-foreground text-sm">
        {formatNumber(usage.used)} active dynamic{" "}
        {usage.used === 1 ? "code" : "codes"} · {PLAN_NAMES[usage.plan]} plan,
        unlimited codes
      </p>
    );
  }

  const percent = Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            {formatNumber(usage.used)} / {formatNumber(usage.limit)} dynamic
            codes ({PLAN_NAMES[usage.plan]})
          </span>
          {isAtLimit(usage) && (
            <span className="text-muted-foreground text-xs">Limit reached</span>
          )}
        </div>
        <Progress aria-label="Dynamic codes used" value={percent} />
        <p className="text-muted-foreground text-xs">
          Archived codes don't count. Existing codes keep working on every plan.
        </p>
      </div>
      <Button onClick={openGetProDialog} size="sm" variant="outline">
        <Gem />
        Upgrade for unlimited
      </Button>
    </div>
  );
}

export function NewCodeButton({
  usage,
  children = "New code",
  ...props
}: { usage: CodeUsage } & ComponentProps<typeof Button>) {
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );

  const onClick = () => {
    if (isAtLimit(usage)) {
      toast.error(
        `Your plan includes ${usage.limit} active dynamic codes. ${usage.unlimitedPlan ? `Archive one or upgrade to ${PLAN_NAMES[usage.unlimitedPlan]}.` : "Archive one to make room."}`,
      );
      openGetProDialog();
      return;
    }
    // Website link or hosted page, chosen in the builder.
    openCodeBuilder({ mode: "create" });
  };

  return (
    <Button onClick={onClick} {...props}>
      <Plus />
      {children}
    </Button>
  );
}
