import { cursorAfter, dedupeLatest } from "../../sinks/state";
import type { SinkDeliveryResult, SinkScan } from "../../sinks/types";
import { columnLetter, type GoogleSheetsClient, sheetRange } from "./client";
import { SCAN_HEADER, SCAN_ID_COLUMN, scanRow } from "./rows";

/** metadata.settings of a Google Sheets "keep in sync" stream. */
export interface SheetSyncTarget {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetTitle: string;
  /** One code, or every code in the workspace (null) */
  codeId: string | null;
  /** Data rows QRdx has written (header excluded) */
  rowsWritten: number;
}

/** Rows around the expected position that a retry re-reads. */
const RETRY_WINDOW = 50;

/**
 * Appends a batch of scans as rows. On a retry (`isRetry`), the rows where a
 * lost response may already have written them are read back and scans whose
 * id is there are skipped, so a retry never duplicates rows.
 */
export async function appendScansToSheet(
  client: GoogleSheetsClient,
  target: SheetSyncTarget,
  scans: SinkScan[],
  { isRetry = false }: { isRetry?: boolean } = {}
): Promise<SinkDeliveryResult & { rowsWritten: number }> {
  const unique = dedupeLatest(scans, (scan) => scan.id);
  const cursor = cursorAfter(scans, (scan) => ({
    at: scan.scannedAt,
    id: scan.id,
  }));
  if (unique.length === 0) {
    return {
      delivered: 0,
      skipped: 0,
      cursor,
      rowsWritten: target.rowsWritten,
    };
  }

  let pending = unique;
  if (isRetry) {
    // Row 1 is the header; data row n sits on sheet row n + 1.
    const from = Math.max(2, target.rowsWritten + 2 - RETRY_WINDOW);
    const to = target.rowsWritten + 1 + unique.length + RETRY_WINDOW;
    const present = new Set(
      (
        await client.getValues(
          target.spreadsheetId,
          sheetRange(
            target.sheetTitle,
            `${SCAN_ID_COLUMN}${from}:${SCAN_ID_COLUMN}${to}`
          )
        )
      )
        .map((row) => row[0])
        .filter(Boolean)
    );
    pending = unique.filter((scan) => !present.has(scan.id));
  }

  const lastColumn = columnLetter(SCAN_HEADER.length - 1);
  if (pending.length > 0) {
    await client.appendRows(
      target.spreadsheetId,
      sheetRange(target.sheetTitle, `A:${lastColumn}`),
      pending.map(scanRow)
    );
  }
  return {
    delivered: pending.length,
    skipped: scans.length - pending.length,
    cursor,
    rowsWritten: target.rowsWritten + unique.length,
  };
}
