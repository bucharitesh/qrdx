"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useTranslations } from "next-intl";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";
import { needsUpgrade } from "./validation";

/**
 * The builder's form error above the footer. When the plan is in the way
 * (LIMIT_REACHED, PLAN_REQUIRED) it offers the upgrade: to the plan with
 * unlimited codes when the code cap is what stopped it.
 */
export function BuilderFormBanner({
  error,
  unlimitedCodesPlan,
  onUpgrade,
}: {
  error: { code: string; message: string } | null;
  /** The cheapest plan with unlimited codes (null when unknown or none) */
  unlimitedCodesPlan: Plan | null | undefined;
  onUpgrade: (plan: Plan | null) => void;
}) {
  const t = useTranslations("codeBuilder.formBanner");
  if (!error) return null;
  const capPlan =
    error.code === "LIMIT_REACHED" && unlimitedCodesPlan
      ? unlimitedCodesPlan
      : null;
  return (
    <div
      className="bg-destructive/10 text-destructive space-y-2 rounded-md p-3 text-sm"
      role="alert"
    >
      <p>{error.message}</p>
      {needsUpgrade(error.code) && (
        <Button onClick={() => onUpgrade(capPlan)} size="sm" type="button">
          {capPlan
            ? t("upgradeToValue", { value: PLAN_NAMES[capPlan] })
            : t("upgrade")}
        </Button>
      )}
    </div>
  );
}
