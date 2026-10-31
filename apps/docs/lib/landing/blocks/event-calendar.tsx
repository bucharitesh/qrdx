// Dates and add-to-calendar output for event blocks, without date libraries.
// Event times are stored as wall-clock strings ("2026-11-14T19:00") plus an
// IANA time zone, and converted to UTC here for calendar links and .ics files.

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" that names a real calendar date. */
export function isValidLocalDateTime(value: string): boolean {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return false;
  const [, y, m, d, h = "00", min = "00"] = match;
  const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +min));
  return (
    date.getUTCFullYear() === +y &&
    date.getUTCMonth() === +m - 1 &&
    date.getUTCDate() === +d &&
    +h < 24 &&
    +min < 60
  );
}

/** Offset of `timeZone` from UTC at the instant `utcMs`, in ms. */
function zoneOffset(utcMs: number, timeZone: string): number {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs))) {
    parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - (utcMs - (utcMs % 1000));
}

/**
 * The UTC instant of a wall-clock time in `timeZone`. Times skipped by a DST
 * change resolve to the first valid instant after them.
 */
export function zonedTimeToUtc(local: string, timeZone: string): Date {
  const match = LOCAL_DATE_TIME.exec(local);
  if (!match) throw new Error(`Invalid local date-time "${local}"`);
  const [, y, m, d, h = "00", min = "00"] = match;
  const guess = Date.UTC(+y, +m - 1, +d, +h, +min);
  const offset = zoneOffset(guess, timeZone);
  let result = guess - offset;
  const corrected = zoneOffset(result, timeZone);
  if (corrected !== offset) result = guess - corrected;
  return new Date(result);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 20261114T180000Z */
export function formatUtcStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** "2026-11-14" → "20261114" */
const compactDate = (date: string) => date.slice(0, 10).replaceAll("-", "");

/** The calendar day after "YYYY-MM-DD" (all-day end dates are exclusive). */
export function nextDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const next = new Date(
    Date.UTC(y as number, (m as number) - 1, (d as number) + 1),
  );
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export interface CalendarEvent {
  title: string;
  description?: string;
  location?: string;
  url?: string;
  /** "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD" when allDay) in `timeZone` */
  start: string;
  end?: string;
  allDay: boolean;
  timeZone: string;
  organizer?: { name?: string; email?: string };
}

export type EventTimes =
  | { allDay: true; startDate: string; endDateExclusive: string }
  | { allDay: false; start: Date; end: Date };

const HOUR_MS = 60 * 60 * 1000;

/** Start and end as UTC instants (or dates for all-day events); end defaults to +1h / +1 day. */
export function eventTimes(event: CalendarEvent): EventTimes {
  if (event.allDay) {
    const startDate = event.start.slice(0, 10);
    const lastDay = event.end?.slice(0, 10);
    return {
      allDay: true,
      startDate,
      endDateExclusive: nextDay(
        lastDay && lastDay >= startDate ? lastDay : startDate,
      ),
    };
  }
  const start = zonedTimeToUtc(event.start, event.timeZone);
  const end = event.end ? zonedTimeToUtc(event.end, event.timeZone) : null;
  return {
    allDay: false,
    start,
    end: end && end > start ? end : new Date(start.getTime() + HOUR_MS),
  };
}

function describe(event: CalendarEvent): string {
  return [event.description, event.url].filter(Boolean).join("\n\n");
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const times = eventTimes(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: times.allDay
      ? `${compactDate(times.startDate)}/${compactDate(times.endDateExclusive)}`
      : `${formatUtcStamp(times.start)}/${formatUtcStamp(times.end)}`,
  });
  const details = describe(event);
  if (details) params.set("details", details);
  if (event.location) params.set("location", event.location);
  if (!times.allDay) params.set("ctz", event.timeZone);
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const times = eventTimes(event);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: times.allDay ? times.startDate : times.start.toISOString(),
    enddt: times.allDay ? times.endDateExclusive : times.end.toISOString(),
    allday: String(times.allDay),
  });
  const details = describe(event);
  if (details) params.set("body", details);
  if (event.location) params.set("location", event.location);
  return `https://outlook.live.com/calendar/0/action/compose?${params}`;
}

export function yahooCalendarUrl(event: CalendarEvent): string {
  const times = eventTimes(event);
  const params = new URLSearchParams({ v: "60", title: event.title });
  if (times.allDay) {
    params.set("st", compactDate(times.startDate));
    params.set("et", compactDate(times.endDateExclusive));
    params.set("dur", "allday");
  } else {
    params.set("st", formatUtcStamp(times.start));
    params.set("et", formatUtcStamp(times.end));
  }
  const details = describe(event);
  if (details) params.set("desc", details);
  if (event.location) params.set("in_loc", event.location);
  return `https://calendar.yahoo.com/?${params}`;
}

// ─── iCalendar (RFC 5545) ────────────────────────────────────────────────────

/** TEXT value escaping (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Parameter value (e.g. CN): quoted when needed; DQUOTE and controls can't appear. */
function icsParam(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strips control characters
  const clean = value.replace(/["\u0000-\u001f\u007f]/g, "");
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets without splitting UTF-8 characters (§3.1). */
export function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75.
    const limit = chunks.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

/** A complete VCALENDAR with one VEVENT, CRLF line endings. */
export function buildIcs(
  event: CalendarEvent,
  { uid, now = new Date() }: { uid: string; now?: Date },
): string {
  const times = eventTimes(event);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//QRdx//Landing pages//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUtcStamp(now)}`,
    ...(times.allDay
      ? [
          `DTSTART;VALUE=DATE:${compactDate(times.startDate)}`,
          `DTEND;VALUE=DATE:${compactDate(times.endDateExclusive)}`,
        ]
      : [
          `DTSTART:${formatUtcStamp(times.start)}`,
          `DTEND:${formatUtcStamp(times.end)}`,
        ]),
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  if (event.organizer?.email) {
    const name = event.organizer.name ? icsParam(event.organizer.name) : "";
    lines.push(
      `ORGANIZER${name ? `;CN=${name}` : ""}:mailto:${event.organizer.email}`,
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** A safe download name from the event title ("Launch party" → launch-party.ics). */
export function icsFilename(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
  return `${base || "event"}.ics`;
}

// ─── Display ─────────────────────────────────────────────────────────────────

export interface EventDisplay {
  /** "Sat, Nov 14, 2026" (range for multi-day events) */
  date: string;
  /** "7:00 PM – 10:00 PM GMT+1", or "All day" */
  time: string;
  /** For the date badge */
  month: string;
  day: string;
  /** ISO string for <time dateTime> */
  iso: string;
}

/** How the event reads to visitors, in the event's own time zone. */
export function formatEventDisplay(event: CalendarEvent): EventDisplay {
  const times = eventTimes(event);
  if (times.allDay) {
    const start = new Date(`${times.startDate}T12:00:00Z`);
    const last = new Date(
      new Date(`${times.endDateExclusive}T12:00:00Z`).getTime() - 24 * HOUR_MS,
    );
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return {
      date:
        last.getTime() > start.getTime()
          ? fmt.formatRange(start, last)
          : fmt.format(start),
      time: "All day",
      month: start.toLocaleString("en-US", { timeZone: "UTC", month: "short" }),
      day: String(start.getUTCDate()),
      iso: times.startDate,
    };
  }

  const { timeZone } = event;
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const sameDay = dateFmt.format(times.start) === dateFmt.format(times.end);
  return {
    date: sameDay
      ? dateFmt.format(times.start)
      : dateFmt.formatRange(times.start, times.end),
    time: sameDay
      ? timeFmt.formatRange(times.start, times.end)
      : `${timeFmt.format(times.start)} – ${timeFmt.format(times.end)}`,
    month: times.start.toLocaleString("en-US", { timeZone, month: "short" }),
    day: times.start.toLocaleString("en-US", { timeZone, day: "numeric" }),
    iso: times.start.toISOString(),
  };
}

/** True once the event is over (end, or start + 1h / end of day). */
export function isEventOver(event: CalendarEvent, now = new Date()): boolean {
  const times = eventTimes(event);
  if (times.allDay) {
    // The last place on Earth to finish the day is UTC-12.
    return now.getTime() > Date.parse(`${times.endDateExclusive}T12:00:00Z`);
  }
  return now > times.end;
}

/** A Google Maps search link for a venue address. */
export function mapSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
