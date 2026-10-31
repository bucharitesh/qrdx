"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import Link from "next/link";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { CopyButton } from "@/components/copy-button";
import { CodeActionsMenu } from "./code-actions-menu";
import { displayUrl, formatDate, formatNumber } from "./format";
import { Sparkline } from "./sparkline";
import { StatusBadge } from "./status-badge";

export function CodesTable({
  codes,
  sparklines,
}: {
  codes: QrCodeView[];
  /** Daily scans for the last 7 days, by code id */
  sparklines: Record<string, number[]>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Short link</TableHead>
          <TableHead className="text-right">Scans</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {codes.map((code) => {
          const href = `/dashboard/codes/${encodeURIComponent(code.id)}`;
          const shortLabel = displayUrl(code.shortLink);
          return (
            <TableRow key={code.id}>
              <TableCell className="max-w-[280px]">
                <Link className="block min-w-0 hover:underline" href={href}>
                  <span className="block truncate font-medium">
                    {code.title || displayUrl(code.destinationUrl)}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {displayUrl(code.destinationUrl)}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground max-w-[200px] truncate font-mono text-xs">
                    {shortLabel}
                  </span>
                  <CopyButton
                    successMessage={{ title: "Short link copied" }}
                    textToCopy={code.shortLink}
                  />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-3">
                  <Sparkline values={sparklines[code.id] ?? []} />
                  <span className="min-w-10 text-right tabular-nums">
                    {formatNumber(code.scanCount)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(code.createdAt)}
              </TableCell>
              <TableCell>
                <StatusBadge status={code.status} />
              </TableCell>
              <TableCell className="text-right">
                <CodeActionsMenu code={code} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
