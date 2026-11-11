"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Progress } from "@repo/design-system/components/ui/progress";
import { Diamonds as Gem } from "iconsax-reactjs";
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
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );
  const resets = dayFormat.format(new Date(resetsAt));

  if (limit === null) {
    return (
      <p className="text-muted-foreground text-sm">
        {used.toLocaleString("en-US")} responses this month across your pages ·{" "}
        {PLAN_NAMES[plan]} plan
      </p>
    );
  }

  const full = used >= limit;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            {used.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}{" "}
            responses this month ({PLAN_NAMES[plan]})
          </span>
          <span className="text-muted-foreground text-xs">Resets {resets}</span>
        </div>
        <Progress
          aria-label="Form responses used this month"
          value={Math.min(100, (used / Math.max(1, limit)) * 100)}
        />
        <p className="text-muted-foreground text-xs">
          {full
            ? `Your forms show "not accepting responses" until ${resets}. Responses you already have are kept.`
            : "Counted across all pages in this workspace. Responses are never deleted when you reach the limit."}
        </p>
      </div>
      {plan !== "business" && (
        <Button onClick={openGetProDialog} size="sm" variant="outline">
          <Gem />
          {plan === "free" ? "Get 1,000 a month" : "Get 10,000 a month"}
        </Button>
      )}
    </div>
  );
}
