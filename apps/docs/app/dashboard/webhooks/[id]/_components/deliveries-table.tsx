"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import {
  DocumentCode2 as FileJson,
  ArrowRotateRight as RotateCw,
} from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WebhookDeliveryView } from "@/lib/events/endpoints";
import { MAX_DELIVERY_ATTEMPTS } from "@/lib/events/types";
import { CopyButton } from "../../_components/event-checkboxes";
import { retryWebhookDelivery } from "../../_lib/actions";
import { DELIVERY_STATUS_LABELS, formatDeliveryTime } from "../../_lib/format";

function StatusBadge({ status }: { status: WebhookDeliveryView["status"] }) {
  return (
    <Badge
      variant={
        status === "succeeded"
          ? "secondary"
          : status === "failed"
            ? "destructive"
            : "outline"
      }
    >
      {DELIVERY_STATUS_LABELS[status]}
    </Badge>
  );
}

function detail(delivery: WebhookDeliveryView): string {
  if (delivery.status === "pending") {
    if (delivery.attempts === 0 && delivery.event === "scan.created") {
      return "Collecting scans for this batch";
    }
    const next = delivery.nextAttemptAt
      ? `next try ${formatDeliveryTime(delivery.nextAttemptAt)}`
      : "queued";
    return delivery.lastError ? `${delivery.lastError} · ${next}` : next;
  }
  return delivery.lastError ?? "2xx response";
}

export function DeliveriesTable({
  deliveries,
  canRetry,
}: {
  deliveries: WebhookDeliveryView[];
  canRetry: boolean;
}) {
  const router = useRouter();
  const [viewing, setViewing] = useState<WebhookDeliveryView | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const retry = (delivery: WebhookDeliveryView) => {
    setRetrying(delivery.id);
    startTransition(async () => {
      const result = await retryWebhookDelivery({ id: delivery.id });
      setRetrying(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.ok) {
        toast.success(
          `Delivered: HTTP ${result.data.status} in ${result.data.durationMs} ms`,
        );
      } else {
        toast.error(`Not delivered: ${result.data.error}`);
      }
      router.refresh();
    });
  };

  if (deliveries.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        No deliveries here yet. Use “Send test” on the Webhooks page to send a
        signed ping.
      </p>
    );
  }

  const json = viewing ? JSON.stringify(viewing.payload, null, 2) : "";

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Attempts</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="min-w-56">Details</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                <TableCell className="font-mono text-xs">
                  {delivery.event}
                </TableCell>
                <TableCell>
                  <StatusBadge status={delivery.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {delivery.attempts}/{MAX_DELIVERY_ATTEMPTS}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {formatDeliveryTime(delivery.createdAt)}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-80 truncate text-xs">
                  <span title={detail(delivery)}>{detail(delivery)}</span>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      aria-label="View payload"
                      onClick={() => setViewing(delivery)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <FileJson />
                    </Button>
                    {canRetry && (
                      <Button
                        aria-label={
                          delivery.status === "succeeded"
                            ? "Send again"
                            : "Retry now"
                        }
                        disabled={retrying === delivery.id}
                        onClick={() => retry(delivery)}
                        size="icon-sm"
                        title={
                          delivery.status === "succeeded"
                            ? "Send again"
                            : "Retry now"
                        }
                        variant="ghost"
                      >
                        {retrying === delivery.id ? <Spinner /> : <RotateCw />}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        onOpenChange={(open) => !open && setViewing(null)}
        open={!!viewing}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payload</DialogTitle>
            <DialogDescription>
              Delivery <code className="font-mono">{viewing?.id}</code> ·{" "}
              {viewing?.event}. Sent as the raw request body.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <pre className="bg-muted max-h-[60vh] overflow-auto rounded-md p-4 font-mono text-xs">
              {json}
            </pre>
            <CopyButton
              className="absolute top-2 right-2"
              label="Copy payload"
              value={json}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
