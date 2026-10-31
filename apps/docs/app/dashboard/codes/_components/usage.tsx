"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Progress } from "@repo/design-system/components/ui/progress";
import { Gem, Plus } from "lucide-react";
import { type ComponentProps, useState } from "react";
import type { CodeUsage } from "@/app/dashboard/codes/_lib/qr-codes";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { CodeDialog } from "./code-dialog";
import { formatNumber } from "./format";

const PLAN_LABELS = { free: "Free", pro: "Pro" } as const;

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
        {usage.used === 1 ? "code" : "codes"} · {PLAN_LABELS[usage.plan]} plan,
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
            codes ({PLAN_LABELS[usage.plan]})
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
  const [open, setOpen] = useState(false);
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );

  const onClick = () => {
    if (isAtLimit(usage)) {
      toast.error(
        `Your plan includes ${usage.limit} active dynamic codes. Archive one or upgrade to Pro.`,
      );
      openGetProDialog();
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Button onClick={onClick} {...props}>
        <Plus />
        {children}
      </Button>
      <CodeDialog onOpenChange={setOpen} open={open} />
    </>
  );
}
