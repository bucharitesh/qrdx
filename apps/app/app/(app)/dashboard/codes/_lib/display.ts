// How a list shows its items (the Display menu): cards or rows, and which
// properties. Remembered in a cookie, so the server renders the chosen view
// from the first paint (localStorage would show the default first). Pure;
// client and server both read it.

export const LIST_VIEWS = ["cards", "rows"] as const;
export type ListView = (typeof LIST_VIEWS)[number];

export const CODE_PROPERTIES = [
  "shortLink",
  "destination",
  "scans",
  "tags",
  "created",
] as const;
export type CodeProperty = (typeof CODE_PROPERTIES)[number];

export const CODE_PROPERTY_LABELS: Record<CodeProperty, string> = {
  shortLink: "Short link",
  destination: "Destination",
  scans: "Scans",
  tags: "Tags",
  created: "Created",
};

export interface ListDisplay {
  view: ListView;
  /** Shown properties, in CODE_PROPERTIES order */
  properties: CodeProperty[];
}

export const DEFAULT_DISPLAY: ListDisplay = {
  view: "cards",
  properties: [...CODE_PROPERTIES],
};

/** Cookies per list: the codes list and the pages list each remember theirs. */
export const DISPLAY_COOKIES = {
  codes: "qrdx_codes_display",
  pages: "qrdx_pages_display",
} as const;
export type DisplayList = keyof typeof DISPLAY_COOKIES;

/** A year: it's a preference, not a session. */
export const DISPLAY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** "rows:shortLink,scans" → the display; anything unknown falls back. */
export function parseDisplay(raw: string | null | undefined): ListDisplay {
  if (!raw) return DEFAULT_DISPLAY;
  const [view, list] = decodeURIComponent(raw).split(":");
  const properties =
    list === undefined
      ? DEFAULT_DISPLAY.properties
      : CODE_PROPERTIES.filter((property) =>
          list.split(",").includes(property),
        );
  return {
    view: LIST_VIEWS.includes(view as ListView)
      ? (view as ListView)
      : DEFAULT_DISPLAY.view,
    properties,
  };
}

export function serializeDisplay(display: ListDisplay): string {
  const properties = CODE_PROPERTIES.filter((property) =>
    display.properties.includes(property),
  );
  return `${display.view}:${properties.join(",")}`;
}

/** The display with one property switched on or off. */
export function toggleProperty(
  display: ListDisplay,
  property: CodeProperty,
): ListDisplay {
  const on = display.properties.includes(property);
  return {
    ...display,
    properties: CODE_PROPERTIES.filter((item) =>
      item === property ? !on : display.properties.includes(item),
    ),
  };
}

/** The cookie string a browser sets to remember `display` for `list`. */
export function displayCookie(list: DisplayList, display: ListDisplay): string {
  return `${DISPLAY_COOKIES[list]}=${encodeURIComponent(
    serializeDisplay(display),
  )}; Path=/; Max-Age=${DISPLAY_COOKIE_MAX_AGE}; SameSite=Lax`;
}
