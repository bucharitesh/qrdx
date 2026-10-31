// Run: cd apps/docs && npx tsx --test lib/landing/blocks/event-calendar.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildIcs,
  type CalendarEvent,
  escapeIcsText,
  eventTimes,
  foldIcsLine,
  formatEventDisplay,
  googleCalendarUrl,
  isEventOver,
  isValidLocalDateTime,
  isValidTimeZone,
  outlookCalendarUrl,
  yahooCalendarUrl,
  zonedTimeToUtc,
} from "./event-calendar";

const event: CalendarEvent = {
  title: "Launch party, part 1; v2",
  description: "Drinks\nand music",
  location: "The Hall, 1 Main St",
  url: "https://example.com/tickets",
  start: "2026-11-14T19:00",
  end: "2026-11-14T22:30",
  allDay: false,
  timeZone: "Europe/Berlin",
  organizer: { name: "Acme, Inc.", email: "events@example.com" },
};

describe("time zones", () => {
  it("validates zones and local date-times", () => {
    assert.equal(isValidTimeZone("Asia/Kolkata"), true);
    assert.equal(isValidTimeZone("Mars/Base"), false);
    assert.equal(isValidLocalDateTime("2026-02-28T23:59"), true);
    assert.equal(isValidLocalDateTime("2026-02-29"), false);
    assert.equal(isValidLocalDateTime("2026-13-01"), false);
    assert.equal(isValidLocalDateTime("2026-01-01T24:00"), false);
    assert.equal(isValidLocalDateTime("tomorrow"), false);
  });

  it("converts wall-clock times to UTC across offsets and DST", () => {
    // Berlin is UTC+1 in November, UTC+2 in July.
    assert.equal(
      zonedTimeToUtc("2026-11-14T19:00", "Europe/Berlin").toISOString(),
      "2026-11-14T18:00:00.000Z",
    );
    assert.equal(
      zonedTimeToUtc("2026-07-01T09:30", "Europe/Berlin").toISOString(),
      "2026-07-01T07:30:00.000Z",
    );
    assert.equal(
      zonedTimeToUtc("2026-01-15T10:00", "Asia/Kolkata").toISOString(),
      "2026-01-15T04:30:00.000Z",
    );
    assert.equal(
      zonedTimeToUtc("2026-06-01T12:00", "America/Los_Angeles").toISOString(),
      "2026-06-01T19:00:00.000Z",
    );
    // 02:30 doesn't exist on 2026-03-29 in Berlin (clocks jump 02:00 → 03:00).
    const skipped = zonedTimeToUtc("2026-03-29T02:30", "Europe/Berlin");
    assert.ok(skipped.toISOString().startsWith("2026-03-29T0"));
  });

  it("defaults the end to one hour (timed) or one day (all-day)", () => {
    const timed = eventTimes({ ...event, end: undefined });
    assert.ok(!timed.allDay);
    if (!timed.allDay) {
      assert.equal(timed.end.getTime() - timed.start.getTime(), 3_600_000);
    }
    const allDay = eventTimes({
      ...event,
      allDay: true,
      start: "2026-12-31",
      end: undefined,
    });
    assert.deepEqual(allDay, {
      allDay: true,
      startDate: "2026-12-31",
      endDateExclusive: "2027-01-01",
    });
  });
});

describe("calendar links", () => {
  it("builds Google, Outlook and Yahoo links in UTC", () => {
    const google = new URL(googleCalendarUrl(event));
    assert.equal(google.hostname, "calendar.google.com");
    assert.equal(
      google.searchParams.get("dates"),
      "20261114T180000Z/20261114T213000Z",
    );
    assert.equal(google.searchParams.get("text"), event.title);
    assert.equal(google.searchParams.get("ctz"), "Europe/Berlin");

    const outlook = new URL(outlookCalendarUrl(event));
    assert.equal(
      outlook.searchParams.get("startdt"),
      "2026-11-14T18:00:00.000Z",
    );
    assert.equal(outlook.searchParams.get("allday"), "false");

    const yahoo = new URL(yahooCalendarUrl(event));
    assert.equal(yahoo.searchParams.get("st"), "20261114T180000Z");
    assert.equal(yahoo.searchParams.get("in_loc"), event.location);
  });

  it("uses dates for all-day events", () => {
    const allDay = {
      ...event,
      allDay: true,
      start: "2026-12-24",
      end: "2026-12-26",
    };
    assert.equal(
      new URL(googleCalendarUrl(allDay)).searchParams.get("dates"),
      "20261224/20261227",
    );
    assert.equal(
      new URL(yahooCalendarUrl(allDay)).searchParams.get("dur"),
      "allday",
    );
  });
});

describe("iCalendar", () => {
  it("escapes TEXT values", () => {
    assert.equal(escapeIcsText("a,b;c\\d\r\ne"), "a\\,b\\;c\\\\d\\ne");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const folded = foldIcsLine(`DESCRIPTION:${"é".repeat(100)}`);
    const lines = folded.split("\r\n");
    assert.ok(lines.length > 1);
    for (const line of lines) {
      assert.ok(new TextEncoder().encode(line).length <= 75);
    }
    assert.equal(
      lines.map((line, i) => (i ? line.slice(1) : line)).join(""),
      `DESCRIPTION:${"é".repeat(100)}`,
    );
  });

  it("builds a VEVENT with UTC times, CRLF endings and escaped text", () => {
    const ics = buildIcs(event, {
      uid: "block.page@qrdx.dev",
      now: new Date("2026-10-31T12:00:00Z"),
    });
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.ok(!/[^\r]\n/.test(ics), "only CRLF line breaks");
    assert.match(ics, /\r\nDTSTART:20261114T180000Z\r\n/);
    assert.match(ics, /\r\nDTEND:20261114T213000Z\r\n/);
    assert.match(ics, /\r\nDTSTAMP:20261031T120000Z\r\n/);
    assert.match(ics, /\r\nSUMMARY:Launch party\\, part 1\\; v2\r\n/);
    assert.match(ics, /\r\nDESCRIPTION:Drinks\\nand music\r\n/);
    assert.match(
      ics,
      /\r\nORGANIZER;CN="Acme, Inc.":mailto:events@example.com\r\n/,
    );
  });

  it("uses VALUE=DATE for all-day events", () => {
    const ics = buildIcs(
      { ...event, allDay: true, start: "2026-12-24", end: "2026-12-24" },
      { uid: "x@qrdx.dev" },
    );
    assert.match(ics, /DTSTART;VALUE=DATE:20261224\r\n/);
    assert.match(ics, /DTEND;VALUE=DATE:20261225\r\n/);
  });
});

describe("display", () => {
  it("formats in the event's time zone", () => {
    const display = formatEventDisplay(event);
    assert.equal(display.date, "Sat, Nov 14, 2026");
    assert.match(display.time, /^7:00\s?–\s?10:30\sPM GMT\+1$/);
    assert.equal(display.month, "Nov");
    assert.equal(display.day, "14");
  });

  it("knows when an event is over", () => {
    assert.equal(isEventOver(event, new Date("2026-11-14T21:00:00Z")), false);
    assert.equal(isEventOver(event, new Date("2026-11-14T21:31:00Z")), true);
    const allDay = { ...event, allDay: true, start: "2026-11-14", end: "" };
    // Still Nov 14 somewhere (UTC-12) until Nov 15 12:00 UTC.
    assert.equal(isEventOver(allDay, new Date("2026-11-15T11:00:00Z")), false);
    assert.equal(isEventOver(allDay, new Date("2026-11-15T12:30:00Z")), true);
  });
});
