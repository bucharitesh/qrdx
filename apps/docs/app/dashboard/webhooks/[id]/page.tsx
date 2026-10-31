import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/app/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
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
import { DELIVERY_STATUS_LABELS } from "../_lib/format";
import { DeliveriesTable } from "./_components/deliveries-table";
import { EndpointSecret } from "./_components/endpoint-secret";

export const metadata: Metadata = {
  title: "Webhook deliveries",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
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
  const scope = await requireDashboardScope();
  const { id } = await params;
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
  const base = `/dashboard/webhooks/${encodeURIComponent(endpoint.id)}`;

  return (
    <div className="space-y-6">
      <Button asChild className="-ml-2" size="sm" variant="ghost">
        <Link href="/dashboard/webhooks">
          <ArrowLeft />
          Webhooks
        </Link>
      </Button>

      <PageHeader
        description={
          <span className="font-mono text-sm break-all">{endpoint.url}</span>
        }
        title="Endpoint deliveries"
      >
        <Badge variant={endpoint.active ? "secondary" : "outline"}>
          {endpoint.active ? "Active" : "Disabled"}
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
        <EndpointSecret
          endpointId={endpoint.id}
          secretPreview={endpoint.secretPreview}
        />
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Recent deliveries</h2>
            <p className="text-muted-foreground text-sm">
              The last 50, kept for 30 days. Failed deliveries are retried up to{" "}
              {MAX_DELIVERY_ATTEMPTS} times with growing waits.
            </p>
          </div>
          <nav aria-label="Filter deliveries" className="flex flex-wrap gap-1">
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
                {filter === "all" ? "All" : DELIVERY_STATUS_LABELS[filter]}
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
