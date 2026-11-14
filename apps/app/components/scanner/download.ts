/** Saves text as a file through a temporary object URL (no server round trip). */
export function downloadText(
  content: string,
  filename: string,
  type: string,
): void {
  // A BOM keeps UTF-8 names intact when spreadsheets and contact apps open the file.
  const blob = new Blob([type.startsWith("text/csv") ? "﻿" : "", content], {
    type,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A filesystem-safe name from scanned text ("Jane Doe" → "jane-doe"). */
export function fileSlug(value: string, fallback: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}
