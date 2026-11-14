import type { ScanDeviceType } from "@repo/database";

// Coarse user-agent parsing, shared by scans (lib/scans.ts), routing rules and
// the account page's session list. Pure: no server imports.

export interface ParsedUserAgent {
  deviceType: ScanDeviceType;
  os: string | null;
  browser: string | null;
}

// First match wins, so more specific tokens come first.
const OS_RULES: [RegExp, string][] = [
  [/Windows Phone/i, "Windows Phone"],
  [/HarmonyOS/i, "HarmonyOS"],
  [/Android/i, "Android"],
  [/iPhone|iPad|iPod/i, "iOS"],
  [/CrOS/, "ChromeOS"],
  [/KAIOS/i, "KaiOS"],
  [/Windows/i, "Windows"],
  [/Macintosh|Mac OS X/i, "macOS"],
  [/Linux/i, "Linux"],
];

// In-app browsers first: their user agents also carry Safari/Chrome tokens.
const BROWSER_RULES: [RegExp, string][] = [
  [/FBAN|FBAV|FB_IAB/, "Facebook"],
  [/Instagram/, "Instagram"],
  [/MicroMessenger/, "WeChat"],
  [/\bLine\//, "LINE"],
  [/Snapchat/, "Snapchat"],
  [/musical_ly|TikTok|BytedanceWebview/, "TikTok"],
  [/\bGSA\//, "Google App"],
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|OPiOS|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/UCBrowser/, "UC Browser"],
  [/YaBrowser/, "Yandex"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/CriOS|Chrome\/|Chromium/, "Chrome"],
  [/Safari\//, "Safari"],
];

const TABLET_PATTERN = /iPad|Tablet|PlayBook|Silk|Kindle|Nexus (?:7|9|10)\b/i;
const MOBILE_PATTERN =
  /Mobi|iPhone|iPod|Windows Phone|IEMobile|BlackBerry|BB10|Opera Mini|KAIOS/i;
const DESKTOP_PATTERN = /Windows NT|Macintosh|X11|CrOS|Linux x86_64/i;

function firstMatch(rules: [RegExp, string][], ua: string): string | null {
  for (const [pattern, name] of rules) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

function deviceTypeOf(ua: string): ScanDeviceType {
  // Android tablets drop the "Mobile" token that Android phones send.
  if (TABLET_PATTERN.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua))) {
    return "tablet";
  }
  if (MOBILE_PATTERN.test(ua)) return "mobile";
  if (DESKTOP_PATTERN.test(ua)) return "desktop";
  return "other";
}

/** Coarse device / OS / browser detection; null when unknown. */
export function parseUserAgent(ua: string): ParsedUserAgent {
  return {
    deviceType: deviceTypeOf(ua),
    os: firstMatch(OS_RULES, ua),
    browser: firstMatch(BROWSER_RULES, ua),
  };
}
