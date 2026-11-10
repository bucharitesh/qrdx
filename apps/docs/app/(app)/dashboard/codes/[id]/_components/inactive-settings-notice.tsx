import {
  inactiveOptions,
  listLabels,
} from "@/app/dashboard/codes/_lib/code-kind-shared";
import { CODE_OPTION_COPY } from "@/app/dashboard/codes/_lib/code-options";
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
  const result = await settings;
  if (!result.success) return null;
  const { kind, routing, utm, pixels } = result.data;
  const inactive = inactiveOptions(kind, { routing, utm, pixels });
  if (inactive.length === 0) return null;
  const names = listLabels(inactive.map((id) => CODE_OPTION_COPY[id].label));
  return (
    <p className="bg-muted rounded-md p-3 text-sm">
      {kind === "page"
        ? `${names} ${inactive.length === 1 ? "is" : "are"} saved from when this code was a website link. Hosted pages don't use ${inactive.length === 1 ? "it" : "them"}.`
        : `${names} ${inactive.length === 1 ? "is" : "are"} saved from when this code opened a hosted page. Website links don't load ${inactive.length === 1 ? "it" : "them"}.`}{" "}
      {inactive.length === 1 ? "It works" : "They work"} again if you switch
      back with Change type.
    </p>
  );
}
