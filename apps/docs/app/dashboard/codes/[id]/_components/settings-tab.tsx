import type { CodeOptionPlans } from "@/app/dashboard/codes/_lib/code-options";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { HistoryPanel } from "./history-panel";
import { LifecyclePanel } from "./lifecycle-panel";
import { PixelsPanel } from "./pixels-panel";
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
      <section className="scroll-mt-20" id="history">
        <HistoryPanel codeId={code.id} />
      </section>
    </div>
  );
}
