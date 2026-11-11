"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Add as Plus } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import type { CodeUsage } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { openCodeBuilder } from "@/components/code-builder/store";
import { CapMeter } from "@/components/limits/cap-meter";
import { useShowLimit } from "@/components/limits/limit-dialog";
import { PLAN_NAMES } from "@/lib/pricing";
import { formatNumber } from "./format";

const isAtLimit = (usage: CodeUsage) =>
  usage.limit !== null && usage.used >= usage.limit;

export function UsageMeter({ usage }: { usage: CodeUsage }) {
  const t = useTranslations("app.dashboard.codes.usage");
  if (usage.limit === null) {
    return (
      <p className="text-muted-foreground text-sm">
        {formatNumber(usage.used)} {t("activeDynamic")}{" "}
        {usage.used === 1 ? t("code") : t("codes")} · {PLAN_NAMES[usage.plan]}{" "}
        {t("planUnlimitedCodes")}
      </p>
    );
  }

  return (
    <CapMeter
      meterId="dynamicCodes"
      note="Archived codes don't count. Existing codes keep working on every plan."
      plan={usage.plan}
      source="codes_meter"
      used={usage.used}
      limit={usage.limit}
    />
  );
}

export function NewCodeButton({
  usage,
  children = "New code",
  ...props
}: { usage: CodeUsage } & ComponentProps<typeof Button>) {
  const showLimit = useShowLimit();

  const onClick = () => {
    // The server would refuse it (LIMIT_REACHED): show the limit instead.
    if (isAtLimit(usage)) {
      showLimit("dynamicCodes", { used: usage.used });
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
