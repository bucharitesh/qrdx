// iCalendar output for event blocks against RFC 5545: required VEVENT
// properties, DATE vs DATE-TIME (UTC "Z"), exclusive all-day DTEND, TEXT
// escaping (§3.3.11), CRLF line endings and 75-octet folding (§3.1).
import { describe, expect, it } from "vitest";
import {
  buildIcs,
  type CalendarEvent,
  escapeIcsText,
  eventTimes,
  foldIcsLine,
  isValidLocalDateTime,
  zonedTimeToUtc,
} from "@/lib/landing/blocks/event-calendar";

const NOW = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));
const base: CalendarEvent = {
  title: "Launch party",
  start: "2026-11-14T19:00",
  end: "2026-11-14T22:00",
  allDay: false,
  timeZone: "Europe/Paris",
};
const ics = (event: Partial<CalendarEvent> = {}) =>
  buildIcs({ ...base, ...event }, { uid: "evt-1@qrdx.dev", now: NOW });
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, "");
const prop = (text: string, name: string) =>
  unfold(text)
    .split("\r\n")
    .find((line) => line.startsWith(`${name}:`) || line.startsWith(`${name};`));

describe("VCALENDAR structure", () => {
  it("uses CRLF only and wraps exactly one VEVENT", () => {
    const text = ics();
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines.some((line) => line.startsWith("PRODID:"))).toBe(true);
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
  });

  it("includes the required UID and DTSTAMP (UTC)", () => {
    const text = ics();
    expect(prop(text, "UID")).toBe("UID:evt-1@qrdx.dev");
    expect(prop(text, "DTSTAMP")).toBe("DTSTAMP:20261031T120000Z");
  });
});

describe("dates", () => {
  it("writes timed events as UTC DATE-TIME with Z (Paris is UTC+1 in November)", () => {
    const text = ics();
    expect(prop(text, "DTSTART")).toBe("DTSTART:20261114T180000Z");
    expect(prop(text, "DTEND")).toBe("DTEND:20261114T210000Z");
  });

  it("writes all-day events as VALUE=DATE with an exclusive end date", () => {
    const text = ics({ allDay: true, start: "2026-12-31", end: "2027-01-01" });
    expect(prop(text, "DTSTART")).toBe("DTSTART;VALUE=DATE:20261231");
    expect(prop(text, "DTEND")).toBe("DTEND;VALUE=DATE:20270102");
  });

  it("never lets DTEND precede DTSTART (end defaults to start + 1 h)", () => {
    const text = ics({ end: "2026-11-14T18:00" });
    expect(prop(text, "DTEND")).toBe("DTEND:20261114T190000Z");
    const allDay = ics({
      allDay: true,
      start: "2026-05-10",
      end: "2026-05-01",
    });
    expect(prop(allDay, "DTEND")).toBe("DTEND;VALUE=DATE:20260511");
  });

  it("reads a time skipped by DST with the offset before the gap (RFC 5545 §3.3.5)", () => {
    // 2026-03-08 02:30 does not exist in New York (clocks jump 02:00 → 03:00):
    // it means 03:30 EDT, one hour after 01:30 EST.
    expect(
      zonedTimeToUtc("2026-03-08T02:30", "America/New_York").toISOString(),
    ).toBe("2026-03-08T07:30:00.000Z");
    expect(
      zonedTimeToUtc("2026-03-29T02:30", "Europe/Berlin").toISOString(),
    ).toBe("2026-03-29T01:30:00.000Z");
  });

  it("reads a time repeated by DST as its first occurrence (RFC 5545 §3.3.5)", () => {
    // 2026-11-01 01:30 happens twice in New York; the first is EDT (UTC-4).
    expect(
      zonedTimeToUtc("2026-11-01T01:30", "America/New_York").toISOString(),
    ).toBe("2026-11-01T05:30:00.000Z");
  });

  it("converts ordinary times in zones east and west of UTC", () => {
    expect(
      zonedTimeToUtc("2026-01-15T10:00", "Asia/Kolkata").toISOString(),
    ).toBe("2026-01-15T04:30:00.000Z");
    expect(
      zonedTimeToUtc("2026-06-01T12:00", "America/Los_Angeles").toISOString(),
    ).toBe("2026-06-01T19:00:00.000Z");
    const times = eventTimes({
      ...base,
      timeZone: "America/New_York",
      start: "2026-07-04T12:00",
      end: undefined,
    });
    expect(times.allDay).toBe(false);
    if (!times.allDay)
      expect(times.start.toISOString()).toBe("2026-07-04T16:00:00.000Z");
  });

  it.each([
    ["2026-02-29", false],
    ["2028-02-29", true],
    ["2026-11-14T24:00", false],
    ["2026-11-14T23:59", true],
    ["14/11/2026", false],
  ])("isValidLocalDateTime(%j) → %s", (value, valid) => {
    expect(isValidLocalDateTime(value)).toBe(valid);
  });
});

describe("TEXT values", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });

  it("escapes SUMMARY, DESCRIPTION and LOCATION", () => {
    const text = ics({
      title: "Q&A; Part 1, live",
      description: "Bring:\n- snacks",
      location: "Hall 3, Main St; Paris",
    });
    expect(prop(text, "SUMMARY")).toBe("SUMMARY:Q&A\\; Part 1\\, live");
    expect(prop(text, "DESCRIPTION")).toBe("DESCRIPTION:Bring:\\n- snacks");
    expect(prop(text, "LOCATION")).toBe("LOCATION:Hall 3\\, Main St\\; Paris");
  });

  it("can't be broken into extra components by a newline in a value", () => {
    const text = ics({ title: "x\r\nEND:VEVENT\r\nBEGIN:VEVENT" });
    expect(text.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
  });

  it("quotes an organizer name containing separators", () => {
    const text = ics({
      organizer: { name: "Doe, Jane", email: "jane@example.com" },
    });
    expect(prop(text, "ORGANIZER")).toBe(
      'ORGANIZER;CN="Doe, Jane":mailto:jane@example.com',
    );
  });
});

describe("line folding", () => {
  it("folds at 75 octets with CRLF + space and never splits a UTF-8 character", () => {
    const line = `DESCRIPTION:${"Zoë 😀 ".repeat(40)}`;
    const folded = foldIcsLine(line);
    for (const physical of folded.split("\r\n")) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    }
    expect(unfold(folded)).toBe(line);
  });

  it("leaves a 75-octet line alone", () => {
    const line = `X:${"a".repeat(73)}`;
    expect(foldIcsLine(line)).toBe(line);
  });
});
