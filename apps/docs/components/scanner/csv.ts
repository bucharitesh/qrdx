export interface CsvRow {
  scannedAt: number;
  format: string;
  type: string;
  value: string;
}

/**
 * Quotes a cell and defuses spreadsheet formulas: scanned content is
 * untrusted, and "=HYPERLINK(...)" must not run when the file is opened.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== value
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
}

export function toCsv(rows: CsvRow[]): string {
  const header = ["scanned_at", "format", "type", "value"].join(",");
  const lines = rows.map((row) =>
    [new Date(row.scannedAt).toISOString(), row.format, row.type, row.value]
      .map(csvCell)
      .join(","),
  );
  return `${[header, ...lines].join("\r\n")}\r\n`;
}
