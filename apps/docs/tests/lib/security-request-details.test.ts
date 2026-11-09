// The device, place, address and time the security emails show
// (lib/security/request-details.ts), with and without the platform's geo
// headers. Most cases run as on Vercel (VERCEL set), whose headers they send.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentRequestDetails,
  formatSecurityTime,
  requestDetails,
} from "@/lib/security/request-details";

const NOW = new Date("2026-11-07T09:34:00Z");
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

beforeEach(() => {
  vi.stubEnv("VERCEL", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestDetails", () => {
  it("off Vercel, ignores Vercel's headers (a client could send them) and reads Cloudflare's country", () => {
    vi.stubEnv("VERCEL", "");
    const spoofed = new Headers({
      "user-agent": CHROME_MAC,
      "x-vercel-ip-city": "S%C3%A3o%20Paulo",
      "x-vercel-ip-country": "BR",
      "x-vercel-ip-timezone": "America/Sao_Paulo",
    });
    expect(requestDetails(spoofed, NOW)).toMatchObject({
      location: null,
      time: "Nov 7, 2026, 9:34 AM UTC",
      timeZone: "UTC",
    });
    spoofed.set("cf-ipcountry", "IN");
    expect(requestDetails(spoofed, NOW).location).toBe("India");
  });

  it("reads the platform's geo headers, URL-decoded, and the place's time", () => {
    const details = requestDetails(
      new Headers({
        "user-agent": CHROME_MAC,
        "x-forwarded-for": "203.0.113.24, 10.0.0.1",
        "x-real-ip": "198.51.100.7",
        "x-vercel-ip-city": "S%C3%A3o%20Paulo",
        "x-vercel-ip-country-region": "SP",
        "x-vercel-ip-country": "BR",
        "x-vercel-ip-timezone": "America/Sao_Paulo",
      }),
      NOW,
    );
    expect(details).toEqual({
      device: "Chrome on macOS",
      location: "São Paulo, Brazil",
      // The platform's header, not the first X-Forwarded-For hop.
      ip: "198.51.100.7",
      time: "Nov 7, 2026, 6:34 AM GMT-3",
      timeZone: "America/Sao_Paulo",
    });
  });

  it("shows the time in UTC, and no place, without the geo headers", () => {
    const details = requestDetails(
      new Headers({ "user-agent": CHROME_MAC, "x-real-ip": "198.51.100.7" }),
      NOW,
    );
    expect(details).toEqual({
      device: "Chrome on macOS",
      location: null,
      ip: "198.51.100.7",
      time: "Nov 7, 2026, 9:34 AM UTC",
      timeZone: "UTC",
    });
  });

  it("names the country alone when the city is unknown", () => {
    const details = requestDetails(
      new Headers({
        "x-vercel-ip-country": "IN",
        "x-vercel-ip-country-region": "MH",
        "x-vercel-ip-timezone": "Asia/Kolkata",
      }),
      NOW,
    );
    expect(details.location).toBe("India");
    expect(details.time).toBe("Nov 7, 2026, 3:04 PM GMT+5:30");
  });

  it("prefers the platform's address to a forwarded one a client can forge", () => {
    const ip = (headers: Record<string, string>) =>
      requestDetails(new Headers(headers), NOW).ip;
    expect(
      ip({
        "x-forwarded-for": "6.6.6.6, 203.0.113.24",
        "x-vercel-forwarded-for": "203.0.113.24",
      }),
    ).toBe("203.0.113.24");
    // Without a platform header, the first forwarded hop.
    expect(ip({ "x-forwarded-for": "203.0.113.24, 10.0.0.1" })).toBe(
      "203.0.113.24",
    );
    // A malformed platform value falls through to the next header.
    expect(
      ip({ "x-real-ip": "unknown", "x-forwarded-for": "203.0.113.24" }),
    ).toBe("203.0.113.24");
  });

  it("ignores values that aren't addresses or zones", () => {
    const details = requestDetails(
      new Headers({
        "x-forwarded-for": "<script>",
        "x-vercel-ip-timezone": "Not/AZone",
      }),
      NOW,
    );
    expect(details.ip).toBeNull();
    expect(details.timeZone).toBe("UTC");
    expect(details.device).toBe("Unknown device");
  });

  it("knows only the time without a request", async () => {
    expect(requestDetails(null, NOW)).toEqual({
      device: "Unknown device",
      location: null,
      ip: null,
      time: "Nov 7, 2026, 9:34 AM UTC",
      timeZone: "UTC",
    });
    // Outside a request, next/headers throws; the details still render.
    const outside = await currentRequestDetails(NOW);
    expect(outside.time).toBe("Nov 7, 2026, 9:34 AM UTC");
    expect(outside.ip).toBeNull();
  });

  it("formats a time in any zone with its name", () => {
    expect(formatSecurityTime(NOW, "Europe/Berlin")).toBe(
      "Nov 7, 2026, 10:34 AM GMT+1",
    );
  });
});
