"use client";

import { toast } from "@repo/design-system";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import Link from "next/link";
import { Suspense, useId, useState, useTransition } from "react";
import {
  type CodeMarketingSettings,
  saveCodePreciseLocation,
} from "@/actions/code-marketing";
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
          enabled
            ? "Scanners will be asked for their location"
            : "Precise location turned off",
        );
      } else {
        setError(result.error.message);
      }
    });
  };

  return (
    <PanelCard
      badge={plan}
      description={
        <>
          See where your code is scanned, down to about 100 m, from scanners who
          choose to share it. Off by default; everyone else keeps IP-based
          country and city.{" "}
          <Link className="underline" href="/docs/precise-location">
            How it works
          </Link>
        </>
      }
      title="Precise location"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl space-y-1">
          <Label className="text-sm font-medium" htmlFor={`${id}-on`}>
            Ask scanners for precise location
          </Label>
          <p className="text-muted-foreground text-sm">
            {isPage
              ? "Your page opens right away, and the browser asks on the page. Nothing changes for people who decline."
              : "Before your link opens, scanners see a short “Share your location?” step with Allow and Skip. Skipping, declining or a slow answer goes straight on."}
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
          {on ? "On" : "Off"}
        </Label>
      </div>

      {locked && plan && (
        <PlanLock plan={plan}>
          {on
            ? `Your plan doesn't include precise location, so scanners aren't being asked. You can turn it off; asking again needs ${PLAN_NAMES[plan]}.`
            : `Precise scan locations and geofence rules are part of ${PLAN_NAMES[plan]}.`}
        </PlanLock>
      )}

      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
        <li>
          Locations are rounded to about 100 m in the scanner's browser before
          they're sent. Nothing is stored when someone declines.
        </li>
        <li>
          Shared points, and the share of scanners who allowed it, appear in
          this code's Analytics, apart from IP-based locations.
          {!isPage && " Area rules in Smart routing use them too."}
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
  return (
    <Suspense fallback={<PanelFallback />}>
      <MarketingSettingsGate settings={settings} title="Precise location">
        {(data) => <PreciseLocationEditor initial={data} plan={plan} />}
      </MarketingSettingsGate>
    </Suspense>
  );
}
