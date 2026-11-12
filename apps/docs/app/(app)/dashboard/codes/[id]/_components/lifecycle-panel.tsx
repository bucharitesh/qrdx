import { getCodeLifecycle } from "@/actions/code-lifecycle";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import type { PaidPlan } from "@/lib/pricing";
import { LifecyclePanelForm } from "./lifecycle-panel-form";
import { PanelCard } from "./routing-panel";

/** "Access & schedule" settings: pause, password, start/end dates, scan limit, fallback. */
export async function LifecyclePanel({
  codeId,
  plan,
}: {
  codeId: string;
  /** The cheapest plan with link controls (lib/plans.ts) */
  plan: PaidPlan | null;
}) {
  const t = await getAppTranslations("app.dashboard.codes.lifecyclePanel");
  const result = await getCodeLifecycle(codeId);
  if (!result.success) {
    return (
      <PanelCard description={result.error.message} title={t("accessSchedule")}>
        {null}
      </PanelCard>
    );
  }
  return <LifecyclePanelForm initial={result.data} plan={plan} />;
}
