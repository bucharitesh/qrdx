// "Open in QRdx": a link into the QRdx playground in the format the site
// reads (apps/docs/lib/playground-links.ts, which this plugin can't import).
// apps/docs/tests/plugins/playground-links.test.ts checks this file against
// that reader.
//
// Only a web address goes in the link, after the `#`, which browsers never
// send to a server. Plain text and other content stay in Figma. A preset goes
// in only when the playground's preset of the same id looks the same as
// this plugin's (PLAYGROUND_PRESETS), so the link never promises a look it
// can't open.

export const PLAYGROUND_URL = "https://qrdx.dev/playground";
/** Names this plugin as the source in the playground's hand-off analytics. */
export const PLAYGROUND_REF = "figma-plugin";
/** The longest address the playground takes from a link. */
const MAX_LINK_URL_LENGTH = 2048;

/**
 * This plugin's presets that match the playground's preset of the same id
 * exactly (apps/docs/utils/qr-presets.ts). The others have drifted.
 */
export const PLAYGROUND_PRESETS: readonly string[] = ["classic", "minimal"];

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

export interface PlaygroundLinkInput {
  /** The code's content */
  value: string;
  presetId?: string | null;
  /** The preset's colors were changed, so it no longer looks like the preset */
  customColors?: boolean;
}

export function playgroundLink({
  value,
  presetId,
  customColors = false,
}: PlaygroundLinkInput): string {
  const query = new URLSearchParams({ ref: PLAYGROUND_REF });
  if (presetId && !customColors && PLAYGROUND_PRESETS.includes(presetId)) {
    query.set("preset", presetId);
  }
  const url = webAddress(value);
  const fragment = url ? `#${new URLSearchParams({ url })}` : "";
  return `${PLAYGROUND_URL}?${query}${fragment}`;
}

/** A link the main thread may open: one this file built. String checks only (Figma's sandbox). */
export function isPlaygroundLink(link: unknown): link is string {
  return (
    typeof link === "string" &&
    link.length <= MAX_LINK_URL_LENGTH * 4 &&
    link.startsWith(`${PLAYGROUND_URL}?ref=${PLAYGROUND_REF}`)
  );
}
