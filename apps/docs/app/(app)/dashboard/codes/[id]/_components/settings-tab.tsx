import { Suspense } from "react";
import type { CodeOptionPlans } from "@/app/(app)/dashboard/codes/_lib/code-options";
import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { cheapestPlanWith } from "@/lib/plans";
import type { PaidPlan } from "@/lib/pricing";
import { HistoryPanel } from "./history-panel";
import { InactiveSettingsNotice } from "./inactive-settings-notice";
import { LifecyclePanel } from "./lifecycle-panel";
import { PixelsPanel } from "./pixels-panel";
import { PreciseLocationPanel } from "./precise-location-panel";
import { type MarketingSettingsPromise, RoutingPanel } from "./routing-panel";
import { UtmPanel } from "./utm-panel";

/**
 * The Settings tab: every option's panel, then the version history. The
 * ids are the anchors the option buttons link to (CODE_OPTION_ANCHORS).
 */
export function SettingsTab({
  code,
  plans,
  marketing,
}: {
  code: QrCodeView;
  plans: CodeOptionPlans;
  marketing: MarketingSettingsPromise;
}) {
  const required = plans.options;
  return (
    <div className="flex flex-col gap-4">
      {/* Settings of the other type, kept after a type change */}
      <Suspense fallback={null}>
        <InactiveSettingsNotice settings={marketing} />
      </Suspense>
      <section className="scroll-mt-20" id="access">
        <LifecyclePanel
          codeId={code.id}
          plan={required.password.requiredPlan}
        />
      </section>
      {/* Hosted pages don't redirect: nothing to route or tag. */}
      {code.kind !== "page" && (
        <>
          <section className="scroll-mt-20" id="routing">
            <RoutingPanel
              plan={required.routing.requiredPlan}
              settings={marketing}
            />
          </section>
          <section className="scroll-mt-20" id="utm">
            <UtmPanel plan={required.utm.requiredPlan} settings={marketing} />
          </section>
        </>
      )}
      <section className="scroll-mt-20" id="tracking">
        <PixelsPanel
          plans={{
            pixels: required.pixels.requiredPlan,
            conversions: required.conversions.requiredPlan,
          }}
          settings={marketing}
        />
      </section>
      {/* Precise scan location (lib/scan-location), redirects and pages alike. */}
      <section className="scroll-mt-20" id="location">
        <PreciseLocationPanel
          plan={preciseLocationPlan()}
          settings={marketing}
        />
      </section>
      <section className="scroll-mt-20" id="history">
        <HistoryPanel codeId={code.id} />
      </section>
    </div>
  );
}

/** The cheapest paid plan with precise location (lib/plans.ts). */
function preciseLocationPlan(): PaidPlan | null {
  const plan = cheapestPlanWith((limits) => limits.preciseLocation);
  return plan && plan !== "free" ? plan : null;
}
