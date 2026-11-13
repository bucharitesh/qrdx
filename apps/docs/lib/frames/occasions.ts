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

/**
 * Orthodox (Eastern) Easter Sunday: the Julian computus, moved onto the
 * Gregorian calendar (13 days, right from 1900 to 2099).
 */
export function orthodoxEasterSunday(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const date = ((d + e + 114) % 31) + 1;
  return addDays(day(year, month, date), 13);
}

/** Dates from a table ("MM-DD" per year), from `before` days ahead of each to `after` days past it. */
const around =
  (dates: Record<number, string>, before: number, after: number) =>
  (year: number) => {
    const window = table(dates, 1)(year);
    if (!window) return null;
    return {
      start: addDays(window.start, -before),
      end: addDays(window.start, after),
    };
  };

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
    // Covers the national days in July, August and early September, from
    // Canada Day to Mexico's (Argentina, Colombia, Belgium, Peru, Singapore,
    // Pakistan, Indonesia and Ukraine too)
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

  // ── Added with the world frames ──
  // Lunisolar dates are each country's published or calculated dates
  // (timeanddate.com, Drik Panchang, hebcal.com, the Hong Kong Observatory,
  // the Umm al-Qura calendar). Where regions differ by a day, the window
  // covers both.

  // South Asia
  lohri: { label: "Lohri", lead: 30, window: fixed(1, 13, 2) },
  "makar-sankranti": {
    label: "Makar Sankranti",
    lead: 30,
    window: fixed(1, 14, 2),
  },
  // Bhogi, Thai Pongal, Mattu Pongal and Kaanum Pongal, January 14-17 or so
  pongal: { label: "Pongal", lead: 30, window: fixed(1, 14, 4) },
  "republic-day-india": {
    label: "Republic Day (India)",
    lead: 30,
    window: fixed(1, 26),
  },
  "bangladesh-independence-day": {
    label: "Independence Day (Bangladesh)",
    lead: 30,
    window: fixed(3, 26),
  },
  ugadi: {
    label: "Ugadi and Gudi Padwa",
    lead: 30,
    window: table({
      2026: "03-19",
      2027: "04-07",
      2028: "03-27",
      2029: "04-14",
      2030: "04-03",
    }),
  },
  vaisakhi: { label: "Vaisakhi", lead: 30, window: fixed(4, 13, 2) },
  "sinhala-tamil-new-year": {
    label: "Sinhala and Tamil New Year",
    lead: 30,
    window: fixed(4, 13, 2),
  },
  // Fixed on April 14 in Bangladesh; April 14 or 15 in West Bengal
  "pohela-boishakh": {
    label: "Pohela Boishakh",
    lead: 30,
    window: fixed(4, 14, 2),
  },
  "raksha-bandhan": {
    label: "Raksha Bandhan",
    lead: 30,
    window: table({
      2026: "08-28",
      2027: "08-17",
      2028: "08-05",
      2029: "08-23",
      2030: "08-13",
    }),
  },
  // Onam runs ten days, from Atham to Thiruvonam (the dates in the table)
  onam: {
    label: "Onam",
    lead: 30,
    window: around(
      {
        2026: "08-26",
        2027: "09-12",
        2028: "09-01",
        2029: "08-22",
        2030: "09-09",
      },
      9,
      0,
    ),
  },
  janmashtami: {
    label: "Janmashtami",
    lead: 30,
    window: table(
      {
        2026: "09-04",
        2027: "08-25",
        2028: "08-13",
        2029: "09-01",
        2030: "08-21",
      },
      2,
    ),
  },
  // Ganeshotsav: from Ganesh Chaturthi to Anant Chaturdashi
  "ganesh-chaturthi": {
    label: "Ganesh Chaturthi",
    lead: 30,
    window: table(
      {
        2026: "09-14",
        2027: "09-04",
        2028: "08-23",
        2029: "09-11",
        2030: "09-01",
      },
      11,
    ),
  },
  // From the first night of Sharad Navratri to Vijaya Dashami, which Bengal
  // (Durga Puja) can keep a day after the rest of India's Dussehra
  navratri: {
    label: "Navratri, Durga Puja and Dussehra",
    lead: 30,
    window: table(
      {
        2026: "10-11",
        2027: "09-30",
        2028: "09-19",
        2029: "10-08",
        2030: "09-28",
      },
      11,
    ),
  },

  // Southeast Asia
  songkran: { label: "Songkran", lead: 30, window: fixed(4, 13, 3) },
  // Vesak follows the full moon of Vesakha, which each country fixes for
  // itself (some years a day or a month apart); nearly always in May
  vesak: { label: "Vesak", lead: 30, window: fixed(5, 1, 32) },
  // The Thai lunar calendar's 12th full moon; 2030's isn't published yet
  // (November 10 or 11), so each window is two days
  "loy-krathong": {
    label: "Loy Krathong",
    lead: 30,
    window: table(
      {
        2026: "11-24",
        2027: "11-13",
        2028: "11-01",
        2029: "11-20",
        2030: "11-10",
      },
      2,
    ),
  },

  // East Asia
  "lantern-festival": {
    label: "Lantern Festival",
    lead: 30,
    window: table({
      2026: "03-03",
      2027: "02-20",
      2028: "02-09",
      2029: "02-27",
      2030: "02-17",
    }),
  },
  "childrens-day": {
    label: "Children's Day (Japan and Korea)",
    lead: 30,
    window: fixed(5, 5),
  },
  "dragon-boat-festival": {
    label: "Dragon Boat Festival",
    lead: 30,
    window: table({
      2026: "06-19",
      2027: "06-09",
      2028: "05-28",
      2029: "06-16",
      2030: "06-05",
    }),
  },
  tanabata: { label: "Tanabata", lead: 30, window: fixed(7, 7) },
  // Mid-July in Tokyo and parts of Kanto, mid-August in most of Japan
  obon: {
    label: "Obon",
    lead: 21,
    window: (year) => ({ start: day(year, 7, 13), end: day(year, 8, 16) }),
  },
  "mid-autumn": {
    label: "Mid-Autumn Festival",
    lead: 30,
    window: table({
      2026: "09-25",
      2027: "09-15",
      2028: "10-03",
      2029: "09-22",
      2030: "09-12",
    }),
  },
  // The day before, the day and the day after
  chuseok: {
    label: "Chuseok",
    lead: 30,
    window: around(
      {
        2026: "09-25",
        2027: "09-15",
        2028: "10-03",
        2029: "09-22",
        2030: "09-12",
      },
      1,
      1,
    ),
  },

  // Middle East and Central Asia
  // Iranian New Year (1 Farvardin) through Sizdah Bedar, the 13th day
  nowruz: {
    label: "Nowruz",
    lead: 30,
    window: table(
      {
        2026: "03-21",
        2027: "03-21",
        2028: "03-20",
        2029: "03-20",
        2030: "03-21",
      },
      13,
    ),
  },
  "islamic-new-year": {
    label: "Islamic New Year",
    lead: 30,
    window: table(
      {
        2026: "06-16",
        2027: "06-06",
        2028: "05-25",
        2029: "05-14",
        2030: "05-03",
      },
      2,
    ),
  },
  // The night of December 20 or 21
  yalda: { label: "Yalda Night", lead: 30, window: fixed(12, 20, 2) },
  // Purim and Rosh Hashanah, from the evening they begin
  purim: {
    label: "Purim",
    lead: 30,
    window: table(
      {
        2026: "03-02",
        2027: "03-22",
        2028: "03-11",
        2029: "02-28",
        2030: "03-18",
      },
      2,
    ),
  },
  "rosh-hashanah": {
    label: "Rosh Hashanah",
    lead: 30,
    window: table(
      {
        2026: "09-11",
        2027: "10-01",
        2028: "09-20",
        2029: "09-09",
        2030: "09-27",
      },
      3,
    ),
  },

  // Africa and the diaspora
  "ghana-independence-day": {
    label: "Independence Day (Ghana)",
    lead: 30,
    window: fixed(3, 6),
  },
  "sham-el-nessim": {
    label: "Sham el-Nessim",
    lead: 30,
    window: (year) => span(addDays(orthodoxEasterSunday(year), 1), 1),
  },
  "freedom-day-south-africa": {
    label: "Freedom Day (South Africa)",
    lead: 30,
    window: fixed(4, 27),
  },
  "africa-day": { label: "Africa Day", lead: 30, window: fixed(5, 25) },
  juneteenth: { label: "Juneteenth", lead: 30, window: fixed(6, 19) },
  // September 11, or 12 in the year before a Gregorian leap year
  enkutatash: {
    label: "Enkutatash (Ethiopian New Year)",
    lead: 30,
    window: fixed(9, 11, 2),
  },
  "nigeria-independence-day": {
    label: "Independence Day (Nigeria)",
    lead: 30,
    window: fixed(10, 1),
  },
  "jamhuri-day": {
    label: "Jamhuri Day (Kenya)",
    lead: 30,
    window: fixed(12, 12),
  },
  kwanzaa: { label: "Kwanzaa", lead: 30, window: fixed(12, 26, 7) },

  // Latin America
  "three-kings-day": {
    label: "Three Kings Day",
    lead: 30,
    window: fixed(1, 6),
  },
  // From the Friday before Shrove Tuesday to Ash Wednesday
  carnival: {
    label: "Carnival and Mardi Gras",
    lead: 35,
    window: (year) => span(addDays(easterSunday(year), -51), 6),
  },
  "festa-junina": { label: "Festa Junina", lead: 30, window: fixed(6, 1, 30) },
  "inti-raymi": { label: "Inti Raymi", lead: 30, window: fixed(6, 24) },
  "fiestas-patrias-chile": {
    label: "Fiestas Patrias (Chile)",
    lead: 30,
    window: fixed(9, 18, 2),
  },
  "day-of-the-dead": {
    label: "Day of the Dead",
    lead: 35,
    window: fixed(11, 1, 2),
  },
  "las-posadas": { label: "Las Posadas", lead: 30, window: fixed(12, 16, 9) },

  // Europe
  "orthodox-christmas": {
    label: "Orthodox Christmas",
    lead: 30,
    window: fixed(1, 6, 2),
  },
  "pancake-day": {
    label: "Pancake Day",
    lead: 21,
    window: (year) => span(addDays(easterSunday(year), -47), 1),
  },
  // The week before Orthodox Lent: Monday to Forgiveness Sunday
  maslenitsa: {
    label: "Maslenitsa",
    lead: 30,
    window: (year) => span(addDays(orthodoxEasterSunday(year), -55), 7),
  },
  "orthodox-easter": {
    label: "Orthodox Easter",
    lead: 35,
    window: (year) => span(addDays(orthodoxEasterSunday(year), -2), 4),
  },
  // April 27, or the 26th when the 27th is a Sunday
  "kings-day": {
    label: "King's Day (Netherlands)",
    lead: 30,
    window: (year) => {
      const date = day(year, 4, 27);
      return span(date.getDay() === 0 ? day(year, 4, 26) : date, 1);
    },
  },
  "festa-della-repubblica": {
    label: "Festa della Repubblica (Italy)",
    lead: 30,
    window: fixed(6, 2),
  },
  "german-unity-day": {
    label: "German Unity Day",
    lead: 30,
    window: fixed(10, 3),
  },
  "poland-independence-day": {
    label: "Independence Day (Poland)",
    lead: 30,
    window: fixed(11, 11),
  },

  // Awareness days and months
  "womens-day": {
    label: "International Women's Day",
    lead: 30,
    window: fixed(3, 8),
  },
  "world-water-day": {
    label: "World Water Day",
    lead: 21,
    window: fixed(3, 22),
  },
  "earth-day": { label: "Earth Day", lead: 30, window: fixed(4, 22) },
  "world-book-day": {
    label: "World Book Day",
    lead: 21,
    window: fixed(4, 23),
  },
  "environment-day": {
    label: "World Environment Day",
    lead: 21,
    window: fixed(6, 5),
  },
  "world-ocean-day": {
    label: "World Ocean Day",
    lead: 21,
    window: fixed(6, 8),
  },
  "blood-donor-day": {
    label: "World Blood Donor Day",
    lead: 21,
    window: fixed(6, 14),
  },
  "yoga-day": {
    label: "International Day of Yoga",
    lead: 21,
    window: fixed(6, 21),
  },
  pride: { label: "Pride Month", lead: 30, window: fixed(6, 1, 30) },
  "peace-day": {
    label: "International Day of Peace",
    lead: 21,
    window: fixed(9, 21),
  },
  "breast-cancer-awareness": {
    label: "Breast Cancer Awareness Month",
    lead: 30,
    window: fixed(10, 1, 31),
  },
  "teachers-day": {
    label: "World Teachers' Day",
    lead: 21,
    window: fixed(10, 5),
  },
  "mental-health-day": {
    label: "World Mental Health Day",
    lead: 21,
    window: fixed(10, 10),
  },
  "world-food-day": {
    label: "World Food Day",
    lead: 21,
    window: fixed(10, 16),
  },
  "kindness-day": {
    label: "World Kindness Day",
    lead: 21,
    window: fixed(11, 13),
  },
  "world-aids-day": {
    label: "World AIDS Day",
    lead: 21,
    window: fixed(12, 1),
  },

  // Seasons
  // South Asia's southwest monsoon; the wet season south of the equator
  monsoon: { label: "Monsoon", lead: 14, window: season([6, 9], [12, 3]) },
  harvest: { label: "Harvest", lead: 14, window: season([9, 10], [3, 4]) },
  "cherry-blossom": {
    label: "Cherry blossom season",
    lead: 21,
    window: (year, hemisphere) =>
      hemisphere === "north"
        ? { start: day(year, 3, 20), end: day(year, 4, 30) }
        : { start: day(year, 9, 20), end: day(year, 10, 31) },
  },
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
