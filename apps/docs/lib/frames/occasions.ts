// When each holiday and season comes round, so the frame picker can show
// the frames for what's coming up first. Fixed dates and rules (Easter,
// Thanksgiving, Mother's Day) work for any year; holidays that follow a
// lunar or lunisolar calendar come from a table of dates, and simply aren't
// surfaced in years past the table (extend it before 2031). Islamic dates
// are the expected ones; local sighting can move them a day.

export type Hemisphere = "north" | "south";

export interface OccasionWindow {
  /** First day of the occasion (local date, midnight) */
  start: Date;
  /** Last day of the occasion */
  end: Date;
}

interface Occasion {
  label: string;
  /** Days before the start that its frames are shown, for printing in time */
  lead: number;
  window: (year: number, hemisphere: Hemisphere) => OccasionWindow | null;
}

const day = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date);
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const span = (start: Date, days: number): OccasionWindow => ({
  start,
  end: addDays(start, days - 1),
});

/** A fixed date each year. */
const fixed =
  (month: number, date: number, days = 1) =>
  (year: number) =>
    span(day(year, month, date), days);

/** Dates from a table ("MM-DD" per year), `days` long. */
const table =
  (dates: Record<number, string>, days = 1) =>
  (year: number) => {
    const value = dates[year];
    if (!value) return null;
    const [month, date] = value.split("-").map(Number) as [number, number];
    return span(day(year, month, date), days);
  };

/** The `nth` `weekday` (0 = Sunday) of `month`. */
function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): Date {
  const first = day(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return day(year, month, 1 + offset + (nth - 1) * 7);
}

/** Western Easter Sunday (the anonymous Gregorian algorithm). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const date = ((h + l - 7 * m + 114) % 31) + 1;
  return day(year, month, date);
}

/** US Thanksgiving: the fourth Thursday of November. */
const thanksgiving = (year: number) => nthWeekday(year, 11, 4, 4);

/** A season by months, mirrored in the southern hemisphere. */
const season =
  (north: [number, number], south: [number, number]) =>
  (year: number, hemisphere: Hemisphere) => {
    const [from, to] = hemisphere === "north" ? north : south;
    const start = day(year, from, 1);
    // Through the end of `to`, which may be in the next year
    const endYear = to < from ? year + 1 : year;
    return { start, end: day(endYear, to + 1, 0) };
  };

export const OCCASIONS: Record<string, Occasion> = {
  "new-year": { label: "New Year", lead: 30, window: fixed(12, 31, 2) },
  "lunar-new-year": {
    label: "Lunar New Year",
    lead: 35,
    window: table(
      {
        2026: "02-17",
        2027: "02-06",
        2028: "01-26",
        2029: "02-13",
        2030: "02-03",
      },
      15,
    ),
  },
  "valentines-day": {
    label: "Valentine's Day",
    lead: 30,
    window: fixed(2, 14),
  },
  ramadan: {
    label: "Ramadan",
    lead: 30,
    window: table(
      {
        2026: "02-18",
        2027: "02-08",
        2028: "01-28",
        2029: "01-16",
        2030: "01-06",
      },
      30,
    ),
  },
  "eid-al-fitr": {
    label: "Eid al-Fitr",
    lead: 30,
    window: table(
      {
        2026: "03-20",
        2027: "03-10",
        2028: "02-27",
        2029: "02-15",
        2030: "02-05",
      },
      3,
    ),
  },
  holi: {
    label: "Holi",
    lead: 30,
    window: table(
      {
        2026: "03-04",
        2027: "03-22",
        2028: "03-11",
        2029: "03-01",
        2030: "03-20",
      },
      2,
    ),
  },
  "st-patricks-day": {
    label: "St Patrick's Day",
    lead: 30,
    window: fixed(3, 17),
  },
  passover: {
    label: "Passover",
    lead: 30,
    window: table(
      {
        2026: "04-01",
        2027: "04-21",
        2028: "04-10",
        2029: "03-30",
        2030: "04-17",
      },
      8,
    ),
  },
  easter: {
    label: "Easter",
    lead: 35,
    window: (year) => span(addDays(easterSunday(year), -2), 4),
  },
  "eid-al-adha": {
    label: "Eid al-Adha",
    lead: 30,
    window: table(
      {
        2026: "05-27",
        2027: "05-16",
        2028: "05-05",
        2029: "04-24",
        2030: "04-13",
      },
      4,
    ),
  },
  "mothers-day": {
    label: "Mother's Day",
    lead: 30,
    // The second Sunday of May, as in the US, Canada, India and many more
    window: (year) => span(nthWeekday(year, 5, 0, 2), 1),
  },
  "fathers-day": {
    label: "Father's Day",
    lead: 30,
    window: (year) => span(nthWeekday(year, 6, 0, 3), 1),
  },
  "canada-day": { label: "Canada Day", lead: 30, window: fixed(7, 1) },
  "us-independence-day": {
    label: "Fourth of July",
    lead: 30,
    window: fixed(7, 4),
  },
  "bastille-day": { label: "Bastille Day", lead: 30, window: fixed(7, 14) },
  "india-independence-day": {
    label: "Independence Day (India)",
    lead: 30,
    window: fixed(8, 15),
  },
  "brazil-independence-day": {
    label: "Independence Day (Brazil)",
    lead: 30,
    window: fixed(9, 7),
  },
  "mexico-independence-day": {
    label: "Independence Day (Mexico)",
    lead: 30,
    window: fixed(9, 16),
  },
  "independence-day": {
    label: "Independence days",
    lead: 30,
    // Covers the national days above, from Canada Day to Mexico's
    window: (year) => ({ start: day(year, 7, 1), end: day(year, 9, 16) }),
  },
  "back-to-school": {
    label: "Back to school",
    lead: 21,
    window: (year, hemisphere) =>
      hemisphere === "north"
        ? { start: day(year, 8, 1), end: day(year, 9, 15) }
        : { start: day(year, 1, 15), end: day(year, 2, 28) },
  },
  halloween: { label: "Halloween", lead: 35, window: fixed(10, 31) },
  diwali: {
    label: "Diwali",
    lead: 35,
    window: table(
      {
        2026: "11-08",
        2027: "10-29",
        2028: "10-17",
        2029: "11-05",
        2030: "10-26",
      },
      5,
    ),
  },
  thanksgiving: {
    label: "Thanksgiving",
    lead: 30,
    window: (year) => span(thanksgiving(year), 1),
  },
  "black-friday": {
    label: "Black Friday",
    lead: 30,
    window: (year) => span(addDays(thanksgiving(year), 1), 1),
  },
  "cyber-monday": {
    label: "Cyber Monday",
    lead: 30,
    window: (year) => span(addDays(thanksgiving(year), 4), 1),
  },
  hanukkah: {
    label: "Hanukkah",
    lead: 30,
    window: table(
      {
        2026: "12-04",
        2027: "12-24",
        2028: "12-12",
        2029: "12-01",
        2030: "12-20",
      },
      8,
    ),
  },
  christmas: { label: "Christmas", lead: 40, window: fixed(12, 24, 3) },
  spring: { label: "Spring", lead: 14, window: season([3, 5], [9, 11]) },
  summer: { label: "Summer", lead: 14, window: season([6, 8], [12, 2]) },
  autumn: { label: "Autumn", lead: 14, window: season([9, 11], [3, 5]) },
  winter: { label: "Winter", lead: 14, window: season([12, 2], [6, 8]) },
};

/** The windows an occasion has around `date` (last year's, this year's, next year's). */
function windowsAround(
  occasion: Occasion,
  date: Date,
  hemisphere: Hemisphere,
): OccasionWindow[] {
  const year = date.getFullYear();
  return [year - 1, year, year + 1]
    .map((y) => occasion.window(y, hemisphere))
    .filter((window): window is OccasionWindow => window !== null);
}

export interface UpcomingOccasion {
  id: string;
  label: string;
  start: Date;
}

/**
 * The occasions whose frames to show first on `date`: from `lead` days
 * before each one until it ends, soonest first (ongoing ones lead).
 */
export function upcomingOccasions(
  date: Date,
  hemisphere: Hemisphere = "north",
): UpcomingOccasion[] {
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const found: UpcomingOccasion[] = [];
  for (const [id, occasion] of Object.entries(OCCASIONS)) {
    const window = windowsAround(occasion, today, hemisphere).find(
      ({ start, end }) =>
        today >= addDays(start, -occasion.lead) && today <= end,
    );
    if (window) found.push({ id, label: occasion.label, start: window.start });
  }
  return found.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// Time zones in the southern hemisphere's temperate zones, where the
// seasons (and the school year) are the other way round.
const SOUTHERN =
  /^(Australia\/|Pacific\/(Auckland|Chatham)|Antarctica\/|America\/(Argentina\/|Buenos_Aires|Santiago|Montevideo|Asuncion|Sao_Paulo|Punta_Arenas)|Africa\/(Johannesburg|Maputo|Windhoek|Gaborone|Maseru|Mbabane|Harare|Lusaka)|Indian\/(Mauritius|Reunion)|Atlantic\/(Stanley|South_Georgia))/;

/** The hemisphere a time zone (`Intl` resolvedOptions().timeZone) is in. */
export function hemisphereOf(timeZone: string | undefined): Hemisphere {
  return timeZone && SOUTHERN.test(timeZone) ? "south" : "north";
}

/** The viewer's hemisphere, from the browser's time zone (north on the server). */
export function viewerHemisphere(): Hemisphere {
  try {
    return hemisphereOf(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "north";
  }
}
