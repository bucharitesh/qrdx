const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** "Nov 1, 2026" (UTC, so server and browser render the same text). */
export function formatDate(date: Date | string): string {
  return DATE_FORMAT.format(new Date(date));
}
