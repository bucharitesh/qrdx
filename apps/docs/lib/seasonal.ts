// Date-gated seasonal layers. Pure helpers, safe on server and client.

export const SEASONS = ["halloween", "christmas", "new-year", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** Query param that previews a season (`?season=christmas`) or hides it (`?season=off`). */
export const SEASON_PARAM = "season";

/** sessionStorage key that remembers a `?season=` preview for the tab. */
export const SEASON_OVERRIDE_STORAGE_KEY = "qrdx:season-override";

/**
 * Inclusive UTC windows as month * 100 + day, in priority order (one season at
 * a time): Christmas and New Year sit inside winter and replace it.
 * A window whose start is after its end wraps the new year.
 */
const SEASON_WINDOWS: { season: Season; start: number; end: number }[] = [
  { season: "christmas", start: 1218, end: 1226 },
  { season: "new-year", start: 1227, end: 102 },
  { season: "halloween", start: 1020, end: 1102 },
  { season: "winter", start: 1201, end: 228 },
];

const inWindow = (monthDay: number, start: number, end: number) =>
  start <= end
    ? monthDay >= start && monthDay <= end
    : monthDay >= start || monthDay <= end;

/** The season running on `date` (UTC), or null. */
export function getActiveSeason(date: Date = new Date()): Season | null {
  const monthDay = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  return (
    SEASON_WINDOWS.find((window) =>
      inWindow(monthDay, window.start, window.end),
    )?.season ?? null
  );
}

/** Festivals inside winter keep its light snow under their own layer. */
export function hasSnow(season: Season | null): boolean {
  return season === "winter" || season === "christmas" || season === "new-year";
}

/**
 * The year a New Year season rings in: next year in late December, this year
 * in early January (local time).
 */
export function ringInYear(now: Date = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/** A season id forces it on, `off` forces it off, anything else is no override. */
export function parseSeasonOverride(
  value: string | string[] | null | undefined,
): Season | "off" | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "off") return "off";
  if (raw && (SEASONS as readonly string[]).includes(raw)) return raw as Season;
  return undefined;
}

/** Server components: resolve the season from the date and a page's `searchParams`. */
export function resolveSeason(
  searchParams?: Record<string, string | string[] | undefined>,
  date: Date = new Date(),
): Season | null {
  const override = parseSeasonOverride(searchParams?.[SEASON_PARAM]);
  if (override === "off") return null;
  return override ?? getActiveSeason(date);
}

/**
 * Client only (call in effects/handlers): the date plus a `?season=` override.
 * The override is remembered for the tab so previews survive navigation.
 */
export function getClientSeason(date: Date = new Date()): Season | null {
  if (typeof window === "undefined") return getActiveSeason(date);
  let override = parseSeasonOverride(
    new URLSearchParams(window.location.search).get(SEASON_PARAM),
  );
  try {
    if (override) {
      window.sessionStorage.setItem(SEASON_OVERRIDE_STORAGE_KEY, override);
    } else {
      override = parseSeasonOverride(
        window.sessionStorage.getItem(SEASON_OVERRIDE_STORAGE_KEY),
      );
    }
  } catch {
    // Storage can be blocked; the query param alone still works.
  }
  if (override === "off") return null;
  return override ?? getActiveSeason(date);
}
