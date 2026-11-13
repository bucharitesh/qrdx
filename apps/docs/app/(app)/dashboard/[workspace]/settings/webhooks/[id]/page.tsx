import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListPagination } from "@/app/(app)/dashboard/_components/list-pagination";
import { PageHeader } from "@/app/(app)/dashboard/_components/page-header";
import { takePage } from "@/app/(app)/dashboard/_lib/list-paging";
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
import { parsePage } from "@/lib/paging";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "Webhook deliveries",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ workspace: string; id: string }>;
  searchParams: Promise<{ status?: string; page?: string | string[] }>;
};

/**
 * Deliveries a page. A busy endpoint keeps thousands for 30 days, so the
 * list pages without counting them: one extra row says whether there's more.
 */
const PAGE_SIZE = 50;

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
  const tp = await getAppTranslations("app.dashboard.paging");
  const scope = await requireDashboardScope();
  const { workspace, id } = await params;
  const list = workspaceHref(workspace, "/settings/webhooks");
  const { status: rawStatus, page: rawPage } = await searchParams;
  const status = FILTERS.includes(rawStatus as DeliveryStatus)
    ? (rawStatus as DeliveryStatus | "all")
    : "all";
  const page = parsePage(rawPage);

  let endpoint: Awaited<ReturnType<typeof getEndpoint>>;
  try {
    endpoint = await getEndpoint(scope, id.slice(0, 64));
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  const [read, { allowed }] = await Promise.all([
    listDeliveries(scope, endpoint.id, {
      status: status === "all" ? undefined : status,
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
    }),
    webhookPlan(scope),
  ]);
  const { rows: deliveries, hasMore } = takePage(read, PAGE_SIZE);
  const canManage = canManageWebhooks(scope);
  const base = `${list}/${encodeURIComponent(endpoint.id)}`;
  const href = (target: number) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };
  // Past the end (an old link; deliveries pruned since): the newest page.
  if (page > 1 && deliveries.length === 0) redirect(href(1));

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
              {t("keptFor30Days", { MAX_DELIVERY_ATTEMPTS })}
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
                scroll={false}
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
        <ListPagination
          labels={{
            navigation: tp("navigation"),
            previous: tp("newer"),
            next: tp("older"),
          }}
          nextHref={hasMore ? href(page + 1) : null}
          previousHref={page > 1 ? href(page - 1) : null}
          summary={tp("page", { page })}
        />
      </section>
    </div>
  );
}
