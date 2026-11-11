import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { SettingsHeader } from "@/app/(app)/settings/components/settings-header";
import { getSsoOverview } from "@/ee/sso/connections";
import { SsoManager } from "@/ee/sso/sso-manager";
import { currentSession } from "@/lib/account/confirmation-server";
import { forbiddenMessage } from "@/lib/permissions";
import { cheapestPlanWith } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Single sign-on",
  robots: { index: false, follow: false },
};

const DOCS_HREF = "/docs/help/teams/single-sign-on";

/** The workspace's SSO connection (OIDC or SAML): Business plan. */
export default async function SsoSettingsPage() {
  const scope = await requireDashboardScope();
  const session = await currentSession();
  const overview = await getSsoOverview(
    scope,
    await headers(),
    session ? { sessionId: session.sessionId, email: session.email } : null,
  );
  const { plan, allowed, canManage, connection } = overview;
  const ssoPlan = cheapestPlanWith((limits) => limits.sso);

  return (
    <div className="space-y-6">
      <SettingsHeader
        description="Let people sign in with your company's identity provider, over OIDC or SAML."
        title="Single sign-on"
      >
        <Badge variant={allowed ? "default" : "secondary"}>
          {PLAN_NAMES[plan]}
        </Badge>
        <Button asChild className="max-sm:h-10" size="sm" variant="outline">
          <Link href={DOCS_HREF}>Docs</Link>
        </Button>
      </SettingsHeader>

      {!allowed && (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          {connection
            ? "This workspace's plan no longer includes single sign-on, so nobody can sign in with it. Members can still use an email code, Google or GitHub. You can remove the connection below."
            : `Single sign-on comes with the ${ssoPlan ? PLAN_NAMES[ssoPlan] : "Business"} plan.`}{" "}
          {/* Inline padding widens the tap target without moving the text. */}
          <Link className="py-3 underline" href="/pricing">
            See plans
          </Link>
        </p>
      )}

      {!canManage && (allowed || connection) && (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          {forbiddenMessage(scope.role, "sso.manage")}
        </p>
      )}

      {(allowed || connection) && <SsoManager overview={overview} />}
    </div>
  );
}
