/**
 * Window events between the seasonal pieces. Kept apart from the casts so
 * the season bar can listen without loading any characters.
 */

/** Fired by the countdown when midnight passes while the page is open. */
export const MIDNIGHT_EVENT = "qrdx:new-year-midnight";
