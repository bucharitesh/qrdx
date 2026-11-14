// The upgrade dialog's headline features (components/get-pro-dialog.tsx, a
// client component that can't read lib/plans). English: the signed-in app
// isn't translated yet. Client-safe, so the catalog stays out of its bundle.
import type { PaidPlan } from "@/lib/pricing";
import { SCAN_HISTORY_DAYS, scanHistoryLabel } from "@/lib/scan-history";

/** "Unlimited analytics history", or "1 year of analytics history". */
function historyLine(days: number): string {
  if (!Number.isFinite(days)) return "Unlimited analytics history";
  const label = scanHistoryLabel(days);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} of analytics history`;
}

/**
 * The pricing page lists every limit; this is the short version. Custom
 * domains only where they can be added (lib/feature-availability-rules.ts).
 */
export function buildUpgradeHighlights(
  options: { customDomains?: boolean } = {},
): Record<PaidPlan, string[]> {
  const domains = options.customDomains !== false;
  return {
    pro: [
      "Unlimited dynamic codes and landing pages",
      historyLine(SCAN_HISTORY_DAYS.pro),
      domains ? "5 custom domains and teams of up to 3" : "Teams of up to 3",
      "Unlimited saved themes, shared with your team",
      "Smart routing, A/B tests, UTM tags and pixels",
    ],
    business: [
      "Everything in Pro",
      "White-label pages with custom CSS",
      domains
        ? "25 custom domains and unlimited team members"
        : "Unlimited team members",
      "Conversion tracking and webhooks",
    ],
  };
}
