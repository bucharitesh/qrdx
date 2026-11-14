import "server-only";
import { cached, withTimeout } from "./cache";
import { weekOfDay } from "./weeks";

// npm downloads for /admin/growth, from npm's public APIs (no key). A
// publish day is mostly mirrors and scanners fetching the new version
// (2026-11-10: qrdx 416 of 525 that week), so each figure is also shown
// without the days a version was published (the registry's `time`).
// Cached for 6 hours per server instance; a failure for 5 minutes.

export const NPM_PACKAGES = [
  "qrdx",
  "@qrdx/cli",
  "@qrdx/n8n-nodes-qrdx",
] as const;

const TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The rolling window shown next to the weeks. */
export const RECENT_DAYS = 28;

export interface DailyDownloads {
  day: string;
  downloads: number;
}

const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * The UTC days a version was published, from the registry document's
 * `time` ({ created, modified, "<version>": ISO time }). `modified` isn't
 * a publish (dist-tag and metadata changes move it); `created` is the first
 * version's publish, already listed under its version.
 */
export function publishDays(time: unknown): Set<string> {
  const days = new Set<string>();
  if (!time || typeof time !== "object") return days;
  for (const [key, value] of Object.entries(time)) {
    if (key === "created" || key === "modified" || typeof value !== "string") {
      continue;
    }
    const day = value.slice(0, 10);
    if (isDay(day)) days.add(day);
  }
  return days;
}

/** npm's `downloads` array, keeping well-formed days only. */
export function parseDownloads(value: unknown): DailyDownloads[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const { day, downloads } = (entry ?? {}) as Record<string, unknown>;
    return isDay(day) && typeof downloads === "number" && downloads >= 0
      ? [{ day, downloads }]
      : [];
  });
}

export interface DownloadFigures {
  downloads: number;
  /** The same days, leaving out the days a version was published */
  withoutPublishDays: number;
  /** Publish days that fall in the period */
  publishDays: string[];
}

function figures(
  days: readonly DailyDownloads[],
  published: ReadonlySet<string>,
): DownloadFigures {
  let downloads = 0;
  let withoutPublishDays = 0;
  const seen: string[] = [];
  for (const { day, downloads: count } of days) {
    downloads += count;
    if (published.has(day)) seen.push(day);
    else withoutPublishDays += count;
  }
  return { downloads, withoutPublishDays, publishDays: seen };
}

export interface DownloadSummary {
  weekly: ({ week: string } & DownloadFigures)[];
  /** The RECENT_DAYS days before `today` (npm has nothing for today yet) */
  recent: DownloadFigures;
}

/** Per page week and for the last RECENT_DAYS days, with and without publish days. */
export function summarizeDownloads(
  days: readonly DailyDownloads[],
  published: ReadonlySet<string>,
  weeks: readonly string[],
  today: string,
): DownloadSummary {
  const end = Date.parse(`${today}T00:00:00Z`);
  const recentFrom = new Date(end - RECENT_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const byWeek = new Map<string, DailyDownloads[]>(
    weeks.map((week) => [week, []]),
  );
  for (const entry of days) byWeek.get(weekOfDay(entry.day))?.push(entry);
  return {
    weekly: weeks.map((week) => ({
      week,
      ...figures(byWeek.get(week) ?? [], published),
    })),
    recent: figures(
      days.filter((entry) => entry.day >= recentFrom && entry.day < today),
      published,
    ),
  };
}

export type PackageDownloads =
  | ({ name: string; status: "ok" } & DownloadSummary)
  | { name: string; status: "missing" }
  | { name: string; status: "error"; message: string };

class NotOnNpm extends Error {}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal,
    cache: "no-store",
  });
  if (response.status === 404) throw new NotOnNpm();
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

async function loadPackage(
  name: string,
  weeks: readonly string[],
  today: string,
): Promise<DownloadSummary> {
  return withTimeout(TIMEOUT_MS, async (signal) => {
    const [range, registry] = await Promise.all([
      getJson(
        `https://api.npmjs.org/downloads/range/${weeks[0]}:${today}/${name}`,
        signal,
      ),
      getJson(
        `https://registry.npmjs.org/${name.replaceAll("/", "%2f")}`,
        signal,
      ),
    ]);
    return summarizeDownloads(
      parseDownloads((range as { downloads?: unknown }).downloads),
      publishDays((registry as { time?: unknown }).time),
      weeks,
      today,
    );
  });
}

export function getNpmDownloads(
  weeks: readonly string[],
  now = new Date(),
): Promise<PackageDownloads[]> {
  const today = now.toISOString().slice(0, 10);
  return Promise.all(
    NPM_PACKAGES.map(async (name): Promise<PackageDownloads> => {
      try {
        const summary = await cached(
          `growth:npm:${name}:${weeks[0]}:${today}`,
          TTL_MS,
          () => loadPackage(name, weeks, today),
          FAILURE_TTL_MS,
        );
        return { name, status: "ok", ...summary };
      } catch (error) {
        if (error instanceof NotOnNpm) return { name, status: "missing" };
        return {
          name,
          status: "error",
          message: (error instanceof Error ? error.message : String(error))
            .split("\n")[0]
            .slice(0, 160),
        };
      }
    }),
  );
}
