import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCodeMarketing } from "@/actions/code-marketing";
import { CodeOptionPlansProvider } from "@/app/(app)/dashboard/codes/_components/code-options";
import { CodeHeader } from "@/app/(app)/dashboard/codes/_components/code-overview";
import { codeOptionPlansFor } from "@/app/(app)/dashboard/codes/_lib/code-option-plans";
import { resolveCodeTab } from "@/app/(app)/dashboard/codes/_lib/code-tabs";
import {
  getCode,
  requireDashboardScope,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { AnalyticsTab } from "@/app/(app)/dashboard/codes/[id]/_components/analytics-tab";
import { CodeTabsNav } from "@/app/(app)/dashboard/codes/[id]/_components/code-tabs-nav";
import { OverviewTab } from "@/app/(app)/dashboard/codes/[id]/_components/overview-tab";
import { SettingsTab } from "@/app/(app)/dashboard/codes/[id]/_components/settings-tab";
import { ViewOnly } from "@/components/workspaces/view-only";
import { HttpError } from "@/lib/error-response";
import { can } from "@/lib/permissions";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { workspaceHref } from "@/lib/workspace-paths";

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
  params: Promise<{ workspace: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scope = await requireDashboardScope();
  const [{ workspace: slug, id }, query] = await Promise.all([
    params,
    searchParams,
  ]);

  const [code, plan] = await Promise.all([
    getCode(scope, id).catch((error: unknown) => {
      if (error instanceof HttpError && error.status === 404) notFound();
      throw error;
    }),
    getPlanForScope(scope),
  ]);
  const tab = resolveCodeTab(query);
  const plans = codeOptionPlansFor(plan);
  // Viewers and billing members see the settings, disabled (the server
  // refuses every save too).
  const readOnly = !can(scope.role, "content.write");

  return (
    <CodeOptionPlansProvider plans={plans}>
      <div className="space-y-6">
        <div className="space-y-4">
          <Button asChild className="-ml-2" size="sm" variant="ghost">
            <Link href={workspaceHref(slug, "/codes")}>
              <ArrowLeft />
              All codes
            </Link>
          </Button>
          <CodeHeader code={code} />
          <CodeTabsNav codeId={code.id} current={tab} slug={slug} />
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
          <ViewOnly
            notice="You have view-only access, so this code's settings can't be changed."
            readOnly={readOnly}
          >
            <SettingsTab
              code={code}
              marketing={getCodeMarketing(code.id)}
              plans={plans}
            />
          </ViewOnly>
        )}
      </div>
    </CodeOptionPlansProvider>
  );
}
