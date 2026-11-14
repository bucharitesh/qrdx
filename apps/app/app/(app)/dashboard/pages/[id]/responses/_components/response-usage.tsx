"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Progress } from "@repo/design-system/components/ui/progress";
import { Diamonds as Gem } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** This month's responses against the plan's monthly limit. */
export function ResponseUsage({
  plan,
  used,
  limit,
  resetsAt,
}: {
  plan: Plan;
  used: number;
  /** null = unlimited */
  limit: number | null;
  /** ISO date the count starts over */
  resetsAt: string;
}) {
  const t = useTranslations("app.dashboard.pages.responses.responseUsage");
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );
  const resets = dayFormat.format(new Date(resetsAt));

  if (limit === null) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("valueResponsesThisMonthAcross", {
          value: used.toLocaleString("en-US"),
          value2: PLAN_NAMES[plan],
        })}
      </p>
    );
  }

  const full = used >= limit;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            {t("valueValue2ResponsesThisMonth", {
              value: used.toLocaleString("en-US"),
              value2: limit.toLocaleString("en-US"),
              value3: PLAN_NAMES[plan],
            })}
          </span>
          <span className="text-muted-foreground text-xs">
            {t("resetsResets", { resets })}
          </span>
        </div>
        <Progress
          aria-label={t("formResponsesUsedThisMonth")}
          value={Math.min(100, (used / Math.max(1, limit)) * 100)}
        />
        <p className="text-muted-foreground text-xs">
          {full
            ? t("yourFormsShowNotAccepting", { resets })
            : t("countedAcrossAllPagesIn")}
        </p>
      </div>
      {plan !== "business" && (
        <Button onClick={openGetProDialog} size="sm" variant="outline">
          <Gem />
          {plan === "free" ? t("get1000AMonth") : t("get10000AMonth")}
        </Button>
      )}
    </div>
  );
}
