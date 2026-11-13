import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// Contacts, calendar events and CSV exports (components/scanner/download.ts)
// go to the share sheet as a file: save to Files, open in Contacts or
// Calendar, or send. The file is written to the app's cache only.
export { fileSlug } from "@/components/scanner/download";

export function downloadText(
  content: string,
  filename: string,
  type: string
): void {
  // A BOM keeps UTF-8 names intact when spreadsheets open the file.
  const data = type.startsWith("text/csv") ? `﻿${content}` : content;
  Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })
    .then(({ uri }) => Share.share({ title: filename, files: [uri] }))
    .catch((error: unknown) => console.warn("Sharing the file failed:", error));
}
