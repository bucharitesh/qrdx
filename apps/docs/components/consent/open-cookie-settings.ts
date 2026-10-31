/**
 * The consent provider only mounts on QRdx's own pages, outside the page
 * tree, so triggers anywhere (e.g. the footer) open the preferences dialog
 * through this window event instead of a c15t hook.
 */
export const OPEN_COOKIE_SETTINGS_EVENT = "qrdx:open-cookie-settings";

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
