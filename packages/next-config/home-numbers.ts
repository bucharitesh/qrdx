// "QRdx in numbers" on the home page is switched by QRDX_HOME_NUMBERS where
// the main app is built (next.config.ts inlines it into server code). QRdx's
// other deployments can't see that build's environment, so the main app
// publishes the switch here: the console's numbers page shows it. Pure:
// route handlers and tests import it.

/**
 * Where the main app publishes the switch. /zone/ holds the documents QRdx's
 * deployments read from each other (also /zone/availability.json and the
 * docs zone's /zone/docs-manifest.json).
 */
export const HOME_NUMBERS_PATH = "/zone/home-numbers.json";

export interface HomeNumbersDocument {
  version: 1;
  /** Whether the home page shows the section. */
  on: boolean;
}

/**
 * `value` as a HomeNumbersDocument, or an error naming what's wrong. Its
 * readers fetch it over the network, so they check the shape first.
 */
export function parseHomeNumbersDocument(value: unknown): HomeNumbersDocument {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { version?: unknown }).version !== 1
  ) {
    throw new Error("Home numbers: not a version 1 document");
  }
  const { on } = value as { on?: unknown };
  if (typeof on !== "boolean") {
    throw new Error("Home numbers: `on` must be true or false");
  }
  return { version: 1, on };
}
