"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown, ArrowUp, ExportSquare } from "iconsax-reactjs";
import { useState } from "react";
import {
  formatDate,
  formatNumber,
} from "@/app/(app)/dashboard/codes/_components/format";
import { formatDistance, formatLatLng, osmUrl } from "@/lib/scan-location/geo";

export interface PreciseLocationRow {
  latitude: number;
  longitude: number;
  count: number;
  accuracyM: number | null;
  /** ISO */
  lastScannedAt: string;
}

type SortKey = "count" | "accuracy" | "last";

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: "count", label: "Scans", className: "text-right" },
  {
    key: "accuracy",
    label: "Accuracy",
    className: "hidden text-right sm:table-cell",
  },
  { key: "last", label: "Last scan", className: "text-right" },
];

const PAGE = 10;

function compare(a: PreciseLocationRow, b: PreciseLocationRow, key: SortKey) {
  switch (key) {
    case "count":
      return a.count - b.count;
    case "accuracy":
      // Unknown accuracy sorts as the least precise.
      return (
        (a.accuracyM ?? Number.POSITIVE_INFINITY) -
        (b.accuracyM ?? Number.POSITIVE_INFINITY)
      );
    case "last":
      return Date.parse(a.lastScannedAt) - Date.parse(b.lastScannedAt);
  }
}

/** Shared scan points, sortable by scans, accuracy or the latest scan. */
export function PreciseLocationsTable({
  rows,
}: {
  rows: PreciseLocationRow[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "count",
    desc: true,
  });
  const [all, setAll] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    const order = compare(a, b, sort.key);
    return (sort.desc ? -order : order) || b.count - a.count;
  });
  const visible = all ? sorted : sorted.slice(0, PAGE);

  const toggle = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, desc: !current.desc }
        : // Most precise first, otherwise biggest or newest first.
          { key, desc: key !== "accuracy" },
    );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Precise scan locations, rounded to about 100 m
          </caption>
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="py-2 pr-3 text-left font-medium" scope="col">
                Location
              </th>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                const Arrow = active && !sort.desc ? ArrowUp : ArrowDown;
                return (
                  <th
                    aria-sort={
                      active ? (sort.desc ? "descending" : "ascending") : "none"
                    }
                    className={cn("py-2 pl-3 font-medium", column.className)}
                    key={column.key}
                    scope="col"
                  >
                    <button
                      className={cn(
                        "hover:text-foreground inline-flex items-center gap-1",
                        active && "text-foreground",
                      )}
                      onClick={() => toggle(column.key)}
                      type="button"
                    >
                      {column.label}
                      <Arrow
                        aria-hidden="true"
                        className={cn("size-3", !active && "opacity-0")}
                      />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                className="border-b last:border-0"
                key={`${row.latitude},${row.longitude}`}
              >
                <td className="py-2 pr-3">
                  <a
                    className="hover:text-foreground inline-flex items-center gap-1.5 font-mono text-xs tabular-nums"
                    href={osmUrl(row)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {formatLatLng(row, 3)}
                    <ExportSquare
                      aria-label="Open in OpenStreetMap"
                      className="text-muted-foreground size-3"
                    />
                  </a>
                </td>
                <td className="py-2 pl-3 text-right tabular-nums">
                  {formatNumber(row.count)}
                </td>
                <td className="text-muted-foreground hidden py-2 pl-3 text-right tabular-nums sm:table-cell">
                  {row.accuracyM === null
                    ? "—"
                    : `±${formatDistance(row.accuracyM)}`}
                </td>
                <td className="text-muted-foreground py-2 pl-3 text-right tabular-nums">
                  {formatDate(row.lastScannedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE && (
        <Button
          onClick={() => setAll((value) => !value)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {all ? "Show fewer" : `Show all ${formatNumber(rows.length)}`}
        </Button>
      )}
    </div>
  );
}
