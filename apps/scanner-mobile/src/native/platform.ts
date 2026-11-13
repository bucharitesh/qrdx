import { Browser } from "@capacitor/browser";
import { Clipboard } from "@capacitor/clipboard";

/** Where link checks go and where qrdx.dev links open. */
export const QRDX_ORIGIN: string =
  import.meta.env.VITE_QRDX_ORIGIN ?? "https://qrdx.dev";

/** A qrdx.dev path ("/report-abuse?url=…") as a full address; others as they are. */
export function siteUrl(href: string): string {
  return new URL(href, QRDX_ORIGIN).toString();
}

/**
 * Web addresses open in the in-app browser (SFSafariViewController, Custom
 * Tabs); app links (tel:, upi:, geo: …) go to the app that handles them.
 */
export function openExternal(url: string): void {
  if (/^https?:/i.test(url)) {
    Browser.open({ url }).catch(() => undefined);
  } else {
    window.location.assign(url);
  }
}

/**
 * The scanner components open links with window.open and <a target> and
 * copy with the Clipboard API, as a browser page does. Inside the app those
 * go through the native plugins instead.
 */
export function installPlatformBridges(): void {
  window.open = ((url?: string | URL) => {
    if (url) {
      openExternal(String(url));
    }
    return null;
  }) as typeof window.open;

  document.addEventListener(
    "click",
    (event) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      const href = link?.getAttribute("href");
      if (href && /^https?:/i.test(href)) {
        event.preventDefault();
        openExternal(href);
      }
    },
    true
  );

  const clipboard = navigator.clipboard as Clipboard | undefined;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      read: clipboard?.read?.bind(clipboard),
      readText: clipboard?.readText?.bind(clipboard),
      writeText: (text: string) => Clipboard.write({ string: text }),
    },
  });
}
