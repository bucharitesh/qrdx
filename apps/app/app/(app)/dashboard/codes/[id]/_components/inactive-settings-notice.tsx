import {
  inactiveOptions,
  listLabels,
} from "@/app/(app)/dashboard/codes/_lib/code-kind-shared";
import { CODE_OPTION_COPY } from "@/app/(app)/dashboard/codes/_lib/code-options";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import type { MarketingSettingsPromise } from "./routing-panel";

/**
 * Options saved while the code was the other type (code-kind.ts keeps them
 * on a switch): named here, since this type's panels don't show them.
 */
export async function InactiveSettingsNotice({
  settings,
}: {
  settings: MarketingSettingsPromise;
}) {
  const t = await getAppTranslations(
    "app.dashboard.codes.inactiveSettingsNotice",
  );
  const result = await settings;
  if (!result.success) return null;
  const { kind, routing, utm, pixels } = result.data;
  const inactive = inactiveOptions(kind, { routing, utm, pixels });
  if (inactive.length === 0) return null;
  const names = listLabels(inactive.map((id) => CODE_OPTION_COPY[id].label));
  return (
    <p className="bg-muted rounded-md p-3 text-sm">
      {t(kind === "page" ? "savedFromLink" : "savedFromPage", {
        names,
        count: inactive.length,
      })}
    </p>
  );
}
