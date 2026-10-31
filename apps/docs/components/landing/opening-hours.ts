// Opening-hours math shared by the hours block, its "Open now" badge and
// tests. Days are Monday-first (0 = Monday … 6 = Sunday); times are "HH:MM"
// in the block's time zone; a range that closes at or before it opens runs
// past midnight.

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export interface TimeRange {
  open: string;
  close: string;
}

export interface DayHours {
  ranges: TimeRange[];
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const minutes = (time: string) => {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
};

/** Weekday (Monday = 0) and minutes since midnight of `date` in `timeZone`. */
export function zonedNow(
  date: Date,
  timeZone: string,
): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
    get("weekday"),
  );
  return {
    day: Math.max(0, day),
    minute: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

export type OpenStatus =
  | { open: true; closesAt: string }
  | { open: false; opensAt: { day: number; time: string } | null };

/** Whether the place is open at `date` (in `timeZone`) and the next change. */
export function openStatus(
  week: DayHours[],
  timeZone: string,
  date: Date = new Date(),
): OpenStatus {
  const { day, minute } = zonedNow(date, timeZone);
  const yesterday = (day + 6) % 7;

  // Overnight ranges that started yesterday.
  for (const range of week[yesterday]?.ranges ?? []) {
    const open = minutes(range.open);
    const close = minutes(range.close);
    if (close <= open && minute < close) {
      return { open: true, closesAt: range.close };
    }
  }
  for (const range of week[day]?.ranges ?? []) {
    const open = minutes(range.open);
    const close = minutes(range.close);
    const overnight = close <= open;
    if (minute >= open && (overnight || minute < close)) {
      return { open: true, closesAt: range.close };
    }
  }

  for (let offset = 0; offset < 8; offset++) {
    const candidate = (day + offset) % 7;
    const ranges = [...(week[candidate]?.ranges ?? [])].sort(
      (a, b) => minutes(a.open) - minutes(b.open),
    );
    const next = ranges.find(
      (range) => offset > 0 || minutes(range.open) > minute,
    );
    if (next)
      return { open: false, opensAt: { day: candidate, time: next.open } };
  }
  return { open: false, opensAt: null };
}
