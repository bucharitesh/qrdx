// Which store button a visitor sees first (apps block). Pure: runs on the
// server with the request's user agent and in the browser.

export type AppPlatform = "ios" | "android" | "other";

export interface AppLink {
  kind: "ios" | "android" | "web";
  href: string;
  label: string;
}

export function detectAppPlatform(
  userAgent: string | null | undefined,
): AppPlatform {
  const ua = userAgent ?? "";
  // Android first: some Android browsers mention "like iPhone".
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

/** The visitor's store first (or the website), then the rest in a stable order. */
export function orderAppLinks(
  links: AppLink[],
  platform: AppPlatform,
): AppLink[] {
  const preferred =
    (platform === "ios" && links.find((link) => link.kind === "ios")) ||
    (platform === "android" && links.find((link) => link.kind === "android")) ||
    links.find((link) => link.kind === "web") ||
    links[0];
  if (!preferred) return [];
  return [preferred, ...links.filter((link) => link !== preferred)];
}

export const APP_STORE_HOSTS = ["apps.apple.com", "itunes.apple.com"];
export const PLAY_STORE_HOSTS = ["play.google.com"];

/** True when `url` is on one of `hosts` (or a subdomain of one). */
export function hostIn(url: string, hosts: readonly string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}
