"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { headers } from "next/headers";
import { ENTERPRISE_HONEYPOT_FIELD } from "@/lib/enterprise";
import {
  type EnterpriseRequestField,
  EnterpriseRequestInvalid,
  sendEnterpriseRequest,
} from "@/lib/enterprise-requests";
import { HttpError } from "@/lib/error-response";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/safety/turnstile";
import { logError } from "@/lib/shared";

// The contact form on /enterprise. Anyone can send it, signed in or not, so
// on top of what pay-by-invoice requests do (an email to QRdx, a few a day)
// it has the public forms' protections: per-IP limits, Cloudflare Turnstile
// where it's set up (lib/safety/turnstile.ts) and a field only bots fill in.

export type EnterpriseFormState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | {
      status: "error";
      code:
        | "invalid"
        | "rateLimited"
        | "check"
        | "notSent"
        | "unavailable"
        | "unknown";
      field?: EnterpriseRequestField;
    };

const shortLimiter = createRateLimiter({
  limiter: slidingWindow(3, "10 m"),
});
const dailyLimiter = createRateLimiter({
  limiter: slidingWindow(10, "1 d"),
});

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

export async function submitEnterpriseRequest(
  _previous: EnterpriseFormState,
  data: FormData,
): Promise<EnterpriseFormState> {
  const email = field(data, "email").trim();
  if (field(data, ENTERPRISE_HONEYPOT_FIELD)) return { status: "sent", email };

  try {
    const requestHeaders = await headers();
    const ip = getClientIp({ headers: requestHeaders });
    await enforceRateLimits([
      { limiter: shortLimiter, key: `enterprise-request:ip:${ip}` },
      { limiter: dailyLimiter, key: `enterprise-request:day:ip:${ip}` },
    ]);
    if (!(await verifyTurnstile(field(data, TURNSTILE_FIELD), ip))) {
      return { status: "error", code: "check" };
    }
    const locale = field(data, "locale");
    await sendEnterpriseRequest(
      {
        name: field(data, "name"),
        email,
        company: field(data, "company"),
        teamSize: field(data, "teamSize") as "1-10",
        need: field(data, "need"),
      },
      isLocale(locale) ? locale : DEFAULT_LOCALE,
    );
    return { status: "sent", email };
  } catch (error) {
    if (error instanceof EnterpriseRequestInvalid) {
      return { status: "error", code: "invalid", field: error.field };
    }
    if (error instanceof HttpError) {
      if (error.code === "RATE_LIMITED") {
        return { status: "error", code: "rateLimited" };
      }
      if (error.code === "NOT_SENT")
        return { status: "error", code: "notSent" };
      if (error.code === "UNAVAILABLE") {
        return { status: "error", code: "unavailable" };
      }
    }
    logError(error as Error, { action: "submitEnterpriseRequest" });
    return { status: "error", code: "unknown" };
  }
}
