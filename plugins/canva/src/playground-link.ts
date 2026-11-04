// "Open in QRdx": a link into the QRdx playground in the format the site
// reads (apps/docs/lib/playground-links.ts, which this app can't import).
// apps/docs/tests/plugins/playground-links.test.ts checks this file against
// that reader.
//
// Only a web address goes in the link, after the `#`, which browsers never
// send to a server. Plain text, the colors, patterns and the logo address
// stay in Canva.

export const PLAYGROUND_URL = "https://qrdx.dev/playground";
/** Names this app as the source in the playground's hand-off analytics. */
export const PLAYGROUND_REF = "canva-app";
/** The longest address the playground takes from a link. */
const MAX_LINK_URL_LENGTH = 2048;

/** An http(s) address without a user name or password, normalized, or null. */
export function webAddress(text: string): string | null {
  const value = text.trim();
  if (!value || value.length > MAX_LINK_URL_LENGTH) return null;
  let url: URL;
  try {
    // Not URL.canParse: Safari added it in 17, and these run in any browser.
    url = new URL(value);
  } catch {
    return null;
  }
  const ok =
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.hostname !== "" &&
    url.username === "" &&
    url.password === "" &&
    url.href.length <= MAX_LINK_URL_LENGTH;
  return ok ? url.href : null;
}

/** The playground, opened with `value` when it is a web address. */
export function playgroundLink(value: string): string {
  const query = new URLSearchParams({ ref: PLAYGROUND_REF });
  const url = webAddress(value);
  const fragment = url ? `#${new URLSearchParams({ url })}` : "";
  return `${PLAYGROUND_URL}?${query}${fragment}`;
}
