import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/app/(app)/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { DELIVERY_STATUS_LABELS } from "@/app/(app)/dashboard/webhooks/_lib/format";
import { DeliveriesTable } from "@/app/(app)/dashboard/webhooks/[id]/_components/deliveries-table";
import { EndpointSecret } from "@/app/(app)/dashboard/webhooks/[id]/_components/endpoint-secret";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { HttpError } from "@/lib/error-response";
import {
  canManageWebhooks,
  getEndpoint,
  listDeliveries,
  webhookPlan,
} from "@/lib/events/endpoints";
import {
  type DeliveryStatus,
  EVENT_INFO,
  MAX_DELIVERY_ATTEMPTS,
} from "@/lib/events/types";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "Webhook deliveries",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ workspace: string; id: string }>;
  searchParams: Promise<{ status?: string }>;
};

const FILTERS: (DeliveryStatus | "all")[] = [
  "all",
  "failed",
  "pending",
  "succeeded",
];

export default async function WebhookDeliveriesPage({
  params,
  searchParams,
}: Props) {
  const t = await getAppTranslations("app.dashboard.settings.webhooks.page");
  const scope = await requireDashboardScope();
  const { workspace, id } = await params;
  const list = workspaceHref(workspace, "/settings/webhooks");
  const { status: rawStatus } = await searchParams;
  const status = FILTERS.includes(rawStatus as DeliveryStatus)
    ? (rawStatus as DeliveryStatus | "all")
    : "all";

  let endpoint: Awaited<ReturnType<typeof getEndpoint>>;
  try {
    endpoint = await getEndpoint(scope, id.slice(0, 64));
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  const [deliveries, { allowed }] = await Promise.all([
    listDeliveries(scope, endpoint.id, {
      status: status === "all" ? undefined : status,
    }),
    webhookPlan(scope),
  ]);
  const canManage = canManageWebhooks(scope);
  const base = `${list}/${encodeURIComponent(endpoint.id)}`;

  return (
    <div className="space-y-6">
      <Button asChild className="-ml-2" size="sm" variant="ghost">
        <Link href={list}>
          <ArrowLeft />
          {t("webhooks")}
        </Link>
      </Button>

      <PageHeader
        description={
          <span className="font-mono text-sm break-all">{endpoint.url}</span>
        }
        title={t("endpointDeliveries")}
      >
        <Badge variant={endpoint.active ? "secondary" : "outline"}>
          {endpoint.active ? t("active") : t("disabled")}
        </Badge>
      </PageHeader>

      <div className="flex flex-wrap gap-1">
        {endpoint.events.map((event) => (
          <Badge key={event} title={event} variant="secondary">
            {EVENT_INFO[event]?.label ?? event}
          </Badge>
        ))}
      </div>

      {canManage && (
        // Showing or rotating the secret asks "Confirm it's you".
        <ConfirmIdentityProvider>
          <EndpointSecret
            endpointId={endpoint.id}
            secretPreview={endpoint.secretPreview}
          />
        </ConfirmIdentityProvider>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t("recentDeliveries")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("theLast50KeptFor", { MAX_DELIVERY_ATTEMPTS })}
            </p>
          </div>
          <nav
            aria-label={t("filterDeliveries")}
            className="flex flex-wrap gap-1"
          >
            {FILTERS.map((filter) => (
              <Link
                aria-current={filter === status ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  filter === status
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "hover:bg-muted",
                )}
                href={filter === "all" ? base : `${base}?status=${filter}`}
                key={filter}
              >
                {filter === "all" ? t("all") : DELIVERY_STATUS_LABELS[filter]}
              </Link>
            ))}
          </nav>
        </div>
        <DeliveriesTable
          canRetry={canManage && allowed}
          deliveries={deliveries}
        />
      </section>
    </div>
  );
}
