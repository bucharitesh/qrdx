"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Gem } from "lucide-react";
import type { ComponentProps } from "react";
import type { PaidPlan } from "@/lib/pricing";
import { PLAN_NAMES } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

/** Opens the upgrade dialog on the lowest plan that includes the feature. */
export function UpgradePlanButton({
  plan,
  children,
  ...props
}: { plan: PaidPlan } & ComponentProps<typeof Button>) {
  const openUpgradeDialog = useGetProDialogStore((s) => s.openUpgradeDialog);
  return (
    <Button onClick={() => openUpgradeDialog(plan)} {...props}>
      <Gem className="size-4" />
      {children ?? `Upgrade to ${PLAN_NAMES[plan]}`}
    </Button>
  );
}
