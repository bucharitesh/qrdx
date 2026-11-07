import { headers as requestHeaders } from "next/headers";
import { describeUserAgent, formatLocation } from "@/lib/account/sessions";
import { scanGeo } from "@/lib/scans";

/**
 * Where and when a security event happened, for the security emails: the
 * browser, approximate place and network address of the request, and the
 * time in that place's zone. Location and time zone come from the hosting
 * platform's geo headers, so they're missing when self-hosted (time is then
 * in UTC).
 */
export interface RequestDetails {
  /** "Chrome on macOS"; "Unknown device" when the request didn't say */
  device: string;
  /** "Mumbai, India"; null when the platform sent no location */
  location: string | null;
  /** The client's address as the platform saw it; null when unknown */
  ip: string | null;
  /** "Nov 7, 2026, 3:04 PM GMT+5:30", in `timeZone` */
  time: string;
  /** The IANA zone `time` is shown in; "UTC" when the place is unknown */
  timeZone: string;
}

type HeaderSource = Pick<Headers, "get">;

const IP = /^[0-9a-f.:]{2,45}$/i;
const TIME_ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

/** First hop of x-forwarded-for, else x-real-ip; null when neither is an address. */
function clientIp(headers: HeaderSource): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "";
  return IP.test(ip) ? ip : null;
}

/** The platform's zone for the client ("Asia/Kolkata") if the runtime knows it. */
function clientTimeZone(headers: HeaderSource): string {
  const zone = headers.get("x-vercel-ip-timezone")?.trim() ?? "";
  if (!TIME_ZONE.test(zone)) return "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
    }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** "Nov 7, 2026, 3:04 PM GMT+5:30" / "Nov 7, 2026, 9:34 AM UTC". */
export function formatSecurityTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

/**
 * "Berlin, Germany", or just the country. The platform's region is a code
 * ("MH", "CA") that reads badly on its own, so it isn't shown.
 */
function approximateLocation(headers: HeaderSource): string | null {
  const { city, country } = scanGeo(headers as Headers);
  return formatLocation({ city, country });
}

export function requestDetails(
  headers: HeaderSource | null | undefined,
  now: Date = new Date(),
): RequestDetails {
  const timeZone = headers ? clientTimeZone(headers) : "UTC";
  return {
    device: describeUserAgent(headers?.get("user-agent") ?? null).label,
    location: headers ? approximateLocation(headers) : null,
    ip: headers ? clientIp(headers) : null,
    time: formatSecurityTime(now, timeZone),
    timeZone,
  };
}

/**
 * The details of the request being handled (a server action, a route
 * handler, or an `after()` callback of either). Outside a request there are
 * none to read, so only the time is known.
 */
export async function currentRequestDetails(
  now: Date = new Date(),
): Promise<RequestDetails> {
  try {
    return requestDetails(await requestHeaders(), now);
  } catch {
    return requestDetails(null, now);
  }
}
