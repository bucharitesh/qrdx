"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent } from "@repo/design-system/components/ui/card";
import {
  ExportSquare as ExternalLink,
  ColorSwatch as Palette,
  Edit2 as Pencil,
} from "iconsax-reactjs";
import type { ReactNode } from "react";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { openCodeBuilder } from "@/components/code-builder/store";
import { CopyButton } from "@/components/copy-button";
import { CodeActionsMenu } from "./code-actions-menu";
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

/** Title, status and actions of the code page, above its tabs. */
export function CodeHeader({ code }: { code: QrCodeView }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-xl font-bold md:text-2xl">
              {code.title || displayUrl(code.destinationUrl)}
            </h1>
            <StatusBadge status={code.status} />
          </div>
          <p className="text-muted-foreground truncate text-sm">
            {displayUrl(code.shortLink)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            onClick={() => openCodeBuilder({ mode: "edit", code })}
            size="sm"
          >
            <Pencil />
            Edit link
          </Button>
          <CodeActionsMenu
            afterDelete="/dashboard/codes"
            code={code}
            showAnalyticsLink={false}
          />
        </div>
      </div>
      {code.status !== "active" && (
        <p className="bg-muted rounded-md p-3 text-sm">
          {STATUS_NOTES[code.status]}
        </p>
      )}
    </div>
  );
}

/**
 * The Overview tab: short link and destination, the QR code with downloads,
 * and `children` (scans and options cards) under the details.
 */
export function CodeOverview({
  code,
  children,
}: {
  code: QrCodeView;
  children?: ReactNode;
}) {
  const openInPlayground = useOpenInPlayground();

  return (
    // Phones: details, QR code, then the rest. Wide screens: the QR code
    // sits in its own column beside everything else.
    <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:grid-rows-[auto_1fr]">
      <Card className="min-w-0 gap-4 py-5 lg:col-start-1">
        <CardContent className="space-y-4 px-5">
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

      <Card className="h-fit gap-3 py-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
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

      {children && (
        <div className="min-w-0 space-y-4 lg:col-start-1">{children}</div>
      )}
    </div>
  );
}
