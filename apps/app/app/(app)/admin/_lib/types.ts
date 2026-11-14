// Types the admin pages and their client components share, apart from the
// queries that produce them: importing one from queries.ts would pull the
// whole query module (and the auth server) into whatever imports the type.

/** One UTC day of a daily count, `date` as YYYY-MM-DD. */
export interface DailyPoint {
  date: string;
  count: number;
}
