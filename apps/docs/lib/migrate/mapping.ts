// "Old link → new QRdx link" exports and the plan-limit wording. Client-safe.

import { displayLink } from "./normalize";
import type { JobItem } from "./types";

const csvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

// Spreadsheet apps run cells starting with = + - @ as formulas.
const safeCell = (value: string) =>
  csvCell(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

/** Rows with an old link and a new QRdx link, in job order. */
export function mappingRows(items: JobItem[]) {
  return items.flatMap((item) =>
    item.newLink
      ? [
          {
            oldLink: item.shortLink ?? "",
            oldId: item.key,
            newLink: item.newLink,
            destination: item.url,
            status: item.status,
          },
        ]
      : [],
  );
}

/** CSV for re-pointing old codes: old link, new QRdx link, destination. */
export function mappingCsv(items: JobItem[]): string {
  const header = ["old_link", "old_id", "new_qrdx_link", "destination", "status"];
  const lines = mappingRows(items).map((row) =>
    [row.oldLink, row.oldId, row.newLink, row.destination, row.status]
      .map(safeCell)
      .join(","),
  );
  return `${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

/** One "old → new" line per code, for "Copy all new links". */
export function mappingText(items: JobItem[]): string {
  return mappingRows(items)
    .map((row) =>
      row.oldLink
        ? `${displayLink(row.oldLink)} → ${row.newLink}`
        : row.newLink,
    )
    .join("\n");
}

/** How many of `count` new codes fit in `remaining` slots (null = unlimited). */
export function fitToLimit(count: number, remaining: number | null) {
  if (remaining === null || count <= remaining) {
    return { fits: count, over: 0 };
  }
  return { fits: Math.max(0, remaining), over: count - Math.max(0, remaining) };
}
