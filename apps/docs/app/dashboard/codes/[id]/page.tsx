import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCodeMarketing } from "@/actions/code-marketing";
import { CodeOptionPlansProvider } from "@/app/dashboard/codes/_components/code-options";
import { CodeHeader } from "@/app/dashboard/codes/_components/code-overview";
import { codeOptionPlansFor } from "@/app/dashboard/codes/_lib/code-option-plans";
import { resolveCodeTab } from "@/app/dashboard/codes/_lib/code-tabs";
import {
  getCode,
  requireDashboardScope,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { AnalyticsTab } from "@/app/dashboard/codes/[id]/_components/analytics-tab";
import { CodeTabsNav } from "@/app/dashboard/codes/[id]/_components/code-tabs-nav";
import { OverviewTab } from "@/app/dashboard/codes/[id]/_components/overview-tab";
import { SettingsTab } from "@/app/dashboard/codes/[id]/_components/settings-tab";
import { HttpError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";

export const metadata: Metadata = {
  title: "QR code",
  robots: { index: false, follow: false },
};

/**
 * One dynamic code: Overview (the code, scans at a glance, options),
 * Analytics and Settings, each its own URL (see _lib/code-tabs.ts).
 */
export default async function CodeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scope = await requireDashboardScope();
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const [code, plan] = await Promise.all([
    getCode(scope, id).catch((error: unknown) => {
      if (error instanceof HttpError && error.status === 404) notFound();
      throw error;
    }),
    getPlanForScope(scope),
  ]);
  const tab = resolveCodeTab(query);
  const plans = codeOptionPlansFor(plan);

  return (
    <CodeOptionPlansProvider plans={plans}>
      <div className="space-y-6">
        <div className="space-y-4">
          <Button asChild className="-ml-2" size="sm" variant="ghost">
            <Link href="/dashboard/codes">
              <ArrowLeft />
              All codes
            </Link>
          </Button>
          <CodeHeader code={code} />
          <CodeTabsNav codeId={code.id} current={tab} />
        </div>

        {tab === "overview" && (
          <OverviewTab
            code={code}
            marketing={getCodeMarketing(code.id)}
            plans={plans}
          />
        )}
        {tab === "analytics" && (
          <AnalyticsTab
            code={code}
            query={query}
            retentionDays={getPlanLimits(plan).analyticsRetentionDays}
          />
        )}
        {tab === "settings" && (
          // Shared by the routing, UTM and pixels panels (streams in).
          <SettingsTab
            code={code}
            marketing={getCodeMarketing(code.id)}
            plans={plans}
          />
        )}
      </div>
    </CodeOptionPlansProvider>
  );
}
