"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  ExportSquare as ExternalLink,
  ColorSwatch as Palette,
  Edit2 as Pencil,
} from "iconsax-reactjs";
import { useState } from "react";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { CopyButton } from "@/components/copy-button";
import { CodeActionsMenu } from "./code-actions-menu";
import { CodeDialog } from "./code-dialog";
import { CodeDownloadButtons, CodeQr } from "./code-qr";
import { displayUrl } from "./format";
import { StatusBadge } from "./status-badge";
import { useOpenInPlayground } from "./use-open-in-playground";

const STATUS_NOTES = {
  archived:
    'Archived: scans show a "no longer active" page. Restore it from the menu to redirect again.',
  disabled:
    "Disabled by QRdx: this code was turned off by moderation and does not redirect. Contact support if you think this is a mistake.",
} as const;

export function CodeOverview({ code }: { code: QrCodeView }) {
  const [editOpen, setEditOpen] = useState(false);
  const openInPlayground = useOpenInPlayground();

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="truncate text-lg">
                  {code.title || displayUrl(code.destinationUrl)}
                </CardTitle>
                <StatusBadge status={code.status} />
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button onClick={() => setEditOpen(true)} size="sm">
                <Pencil />
                Edit link
              </Button>
              <CodeActionsMenu
                afterDelete="/dashboard"
                code={code}
                showAnalyticsLink={false}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-5">
          {code.status !== "active" && (
            <p className="bg-muted rounded-md p-3 text-sm">
              {STATUS_NOTES[code.status]}
            </p>
          )}
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Short link (encoded in the QR code)
            </p>
            <div className="flex items-center gap-1">
              <code className="bg-muted min-w-0 truncate rounded-md px-2 py-1 text-sm">
                {code.shortLink}
              </code>
              <CopyButton
                className="size-8"
                successMessage={{ title: "Short link copied" }}
                textToCopy={code.shortLink}
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Opens
            </p>
            <a
              className="inline-flex max-w-full items-center gap-1 text-sm break-all hover:underline"
              href={code.destinationUrl}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              {code.destinationUrl}
              <ExternalLink className="text-muted-foreground size-3.5 shrink-0" />
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardContent className="space-y-3 px-4">
          <CodeQr
            className="bg-muted/40 rounded-lg border p-3"
            style={code.style}
            value={code.shortLink}
          />
          <CodeDownloadButtons code={code} />
          <Button
            className="w-full"
            onClick={() => openInPlayground(code)}
            size="sm"
            variant="ghost"
          >
            <Palette />
            Edit design in playground
          </Button>
        </CardContent>
      </Card>

      <CodeDialog code={code} onOpenChange={setEditOpen} open={editOpen} />
    </div>
  );
}
