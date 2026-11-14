import { changelogSource } from "@/lib/content-source";

/** "0.1.0" > "0.0.6", for entries released on the same day. */
function compareVersions(a = "0", b = "0"): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** Changelog entries, newest first (the page and its Open Graph image). */
export function changelogEntries() {
  return [...changelogSource.getPages()].sort(
    (a, b) =>
      new Date(b.data.date).getTime() - new Date(a.data.date).getTime() ||
      compareVersions(b.data.version, a.data.version),
  );
}
