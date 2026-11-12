"use client";

import { toast } from "@repo/design-system";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useTranslations } from "next-intl";
import { Suspense, useId, useState, useTransition } from "react";
import {
  type CodeMarketingSettings,
  saveCodePreciseLocation,
} from "@/actions/code-marketing";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { type PaidPlan, PLAN_NAMES } from "@/lib/pricing";
import {
  MarketingSettingsGate,
  type MarketingSettingsPromise,
  PanelCard,
  PanelError,
  PanelFallback,
  PlanLock,
} from "./routing-panel";

function PreciseLocationEditor({
  initial,
  plan,
}: {
  initial: CodeMarketingSettings;
  plan: PaidPlan | null;
}) {
  const t = useTranslations("app.dashboard.codes.preciseLocationPanel");
  const id = useId();
  const [settings, setSettings] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const on = settings.pixels?.preciseLocation === true;
  const locked = !settings.features.preciseLocation;
  const isPage = settings.kind === "page";

  const toggle = (enabled: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await saveCodePreciseLocation({
        id: settings.codeId,
        enabled,
      });
      if (result.success) {
        setSettings(result.data);
        toast.success(
          enabled ? t("scannersWillBeAskedFor") : t("preciseLocationTurnedOff"),
        );
      } else {
        setError(result.error.message);
      }
    });
  };

  return (
    <PanelCard
      badge={plan}
      description={t.rich("seeWhereYourCodeIs", {
        link: (chunks) => (
          <Link className="underline" href="/docs/precise-location">
            {chunks}
          </Link>
        ),
      })}
      title={t("preciseLocation")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl space-y-1">
          <Label className="text-sm font-medium" htmlFor={`${id}-on`}>
            {t("askScannersForPreciseLocation")}
          </Label>
          <p className="text-muted-foreground text-sm">
            {isPage
              ? t("yourPageOpensRightAway")
              : t("beforeYourLinkOpensScanners")}
          </p>
        </div>
        <Label
          className="flex items-center gap-2 text-sm font-normal"
          htmlFor={`${id}-on`}
        >
          <Switch
            checked={on}
            disabled={isPending || (locked && !on)}
            id={`${id}-on`}
            onCheckedChange={toggle}
          />
          {on ? t("on") : t("off")}
        </Label>
      </div>

      {locked && plan && (
        <PlanLock plan={plan}>
          {on
            ? t("yourPlanDoesntIncludePrecise", { value: PLAN_NAMES[plan] })
            : t("preciseScanLocationsAndGeofence", { value: PLAN_NAMES[plan] })}
        </PlanLock>
      )}

      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
        <li>{t("locationsAreRoundedToAbout")}</li>
        <li>
          {t("sharedPointsAndTheShare")}
          {!isPage && t("areaRulesInSmartRouting")}
        </li>
      </ul>
      {error && <PanelError message={error} />}
    </PanelCard>
  );
}

/** "Ask scanners for precise location" for one code (lib/scan-location). */
export function PreciseLocationPanel({
  settings,
  plan,
}: {
  settings: MarketingSettingsPromise;
  /** The cheapest plan with precise location (lib/plans.ts) */
  plan: PaidPlan | null;
}) {
  const t = useTranslations("app.dashboard.codes.preciseLocationPanel");
  return (
    <Suspense fallback={<PanelFallback />}>
      <MarketingSettingsGate settings={settings} title={t("preciseLocation")}>
        {(data) => <PreciseLocationEditor initial={data} plan={plan} />}
      </MarketingSettingsGate>
    </Suspense>
  );
}
