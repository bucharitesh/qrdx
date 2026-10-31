"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { ChevronRight, X } from "lucide-react";
import { toCsv } from "./csv";
import { formatLabel } from "./detector";
import { downloadText } from "./download";
import type { HistoryEntry } from "./history";
import { KIND_LABELS, parseScan, type ScanKind, summarizeScan } from "./parse";
import { KIND_ICONS } from "./result-card";

function kindOf(entry: HistoryEntry): ScanKind {
  return entry.kind in KIND_LABELS ? (entry.kind as ScanKind) : "text";
}

export function exportEntries(entries: HistoryEntry[], name: string): void {
  const csv = toCsv(
    [...entries]
      .sort((a, b) => a.scannedAt - b.scannedAt)
      .map((entry) => ({
        scannedAt: entry.scannedAt,
        format: formatLabel(entry.format),
        type: KIND_LABELS[kindOf(entry)],
        value: entry.value,
      })),
  );
  const date = new Date().toISOString().slice(0, 10);
  downloadText(csv, `${name}-${date}.csv`, "text/csv;charset=utf-8");
}

export function EntryList({
  entries,
  onOpen,
  onRemove,
}: {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onRemove?: (entry: HistoryEntry) => void;
}) {
  return (
    <ul className="divide-border flex flex-col divide-y rounded-xl border">
      {entries.map((entry) => {
        const kind = kindOf(entry);
        const Icon = KIND_ICONS[kind];
        const summary = summarizeScan(parseScan(entry.value, entry.format));
        return (
          <li className="flex items-center gap-1 pr-1" key={entry.id}>
            <button
              className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-2.5 text-left"
              onClick={() => onOpen(entry)}
              type="button"
            >
              <Icon
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {summary || entry.value}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {KIND_LABELS[kind]} · {formatLabel(entry.format)} ·{" "}
                  {new Date(entry.scannedAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
            </button>
            {onRemove && (
              <Button
                aria-label={`Remove ${summary || "scan"} from history`}
                onClick={() => onRemove(entry)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
