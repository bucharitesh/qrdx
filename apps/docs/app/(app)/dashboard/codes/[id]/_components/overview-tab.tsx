import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { getCodeLifecycle } from "@/actions/code-lifecycle";
import { CodeOptionGrid } from "@/app/(app)/dashboard/codes/_components/code-options";
import { CodeOverview } from "@/app/(app)/dashboard/codes/_components/code-overview";
import {
  formatDate,
  formatNumber,
} from "@/app/(app)/dashboard/codes/_components/format";
// NFC (feat/nfc): "Use with NFC" / "Put this card on NFC".
import { NfcCard } from "@/app/(app)/dashboard/codes/_components/nfc-card";
import { Sparkline } from "@/app/(app)/dashboard/codes/_components/sparkline";
import {
  CODE_OPTION_ANCHORS,
  type CodeOptionId,
  type CodeOptionPlans,
  codeOptionStatus,
  codeOptionsFor,
} from "@/app/(app)/dashboard/codes/_lib/code-options";
import { codeTabHref } from "@/app/(app)/dashboard/codes/_lib/code-tabs";
import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getScanSparklines } from "@/lib/scans";
import { requestWorkspaceSlug } from "@/lib/scope";
import { LandingPagePanel } from "./landing-page-panel";
import type { MarketingSettingsPromise } from "./routing-panel";

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-base font-semibold tabular-nums sm:text-lg">
          {value}
        </p>
        {children}
      </div>
    </div>
  );
}

/** The Overview tab: the code, its scans at a glance and its options. */
export async function OverviewTab({
  code,
  plans,
  marketing,
}: {
  code: QrCodeView;
  plans: CodeOptionPlans;
  marketing: MarketingSettingsPromise;
}) {
  const [sparklines, settings, lifecycle, slug] = await Promise.all([
    getScanSparklines([code.id], 7),
    marketing,
    getCodeLifecycle(code.id),
    requestWorkspaceSlug(),
  ]);
  const week = sparklines.get(code.id) ?? [];
  const weekTotal = week.reduce((sum, value) => sum + value, 0);
  const kind = code.kind === "page" ? "page" : "redirect";
  const status = codeOptionStatus(
    settings.success ? settings.data : null,
    lifecycle.success ? lifecycle.data : null,
  );
  const hrefs = Object.fromEntries(
    codeOptionsFor(kind).map((id) => [
      id,
      codeTabHref(slug, code.id, "settings", {
        hash: CODE_OPTION_ANCHORS[id],
      }),
    ]),
  ) as Partial<Record<CodeOptionId, string>>;

  return (
    <CodeOverview code={code}>
      <LandingPagePanel codeId={code.id} />
      <Card className="gap-3 py-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
          <CardTitle className="text-base">Scans</CardTitle>
          <Button asChild className="-my-1" size="sm" variant="ghost">
            <Link href={codeTabHref(slug, code.id, "analytics")}>
              View analytics
              <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 px-4">
          <Stat label="Total" value={formatNumber(code.scanCount)} />
          <Stat label="Last 7 days" value={formatNumber(weekTotal)}>
            {weekTotal > 0 && <Sparkline values={week} />}
          </Stat>
          <Stat label="Last scan" value={formatDate(code.lastScannedAt)} />
        </CardContent>
      </Card>
      {/* NFC (feat/nfc) */}
      <NfcCard code={code} />
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">Options</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <CodeOptionGrid
            className="xl:grid-cols-3"
            hrefs={hrefs}
            kind={kind}
            plans={plans}
            status={status}
          />
        </CardContent>
      </Card>
    </CodeOverview>
  );
}
