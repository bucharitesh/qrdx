"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { headers } from "next/headers";
import { z } from "zod";
import { ABUSE_REASONS } from "@/lib/safety/abuse-reasons";
import { fileAbuseReport, parseReportTarget } from "@/lib/safety/reports";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/safety/turnstile";
import { visitorHash } from "@/lib/scans";

export type ReportFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; field?: "url" | "reason" | "email" };

const shortLimiter = createRateLimiter({
  limiter: slidingWindow(5, "600 s"),
});
const dailyLimiter = createRateLimiter({
  limiter: slidingWindow(20, "86400 s"),
});

const reasonValues = ABUSE_REASONS.map((item) => item.value) as [
  (typeof ABUSE_REASONS)[number]["value"],
  ...(typeof ABUSE_REASONS)[number]["value"][],
];

const reportSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Paste the QR code's link or its short code")
    .max(2048, "That link is too long"),
  reason: z.enum(reasonValues, { error: "Choose what's wrong" }),
  details: z
    .string()
    .trim()
    .max(2000, "Keep the details under 2,000 characters")
    .transform((value) => value || null),
  email: z
    .union([z.literal(""), z.email("Enter a valid email address").max(254)])
    .transform((value) => value || null),
});

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

export async function submitAbuseReport(
  _previous: ReportFormState,
  data: FormData,
): Promise<ReportFormState> {
  const parsed = reportSchema.safeParse({
    url: field(data, "url"),
    reason: field(data, "reason"),
    details: field(data, "details"),
    email: field(data, "email"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    return {
      status: "error",
      message: issue?.message ?? "Check the form and try again.",
      field:
        path === "url" || path === "reason" || path === "email"
          ? path
          : undefined,
    };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-real-ip")?.trim() ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  try {
    const [short, daily] = await Promise.all([
      shortLimiter.limit(`report-abuse:ip:${ip}`),
      dailyLimiter.limit(`report-abuse:day:ip:${ip}`),
    ]);
    if (!(short.success && daily.success)) {
      return {
        status: "error",
        message:
          "You've sent several reports in a short time. Please try again later, or email support@qrdx.dev.",
      };
    }
  } catch {
    // The limiter fails open.
  }

  if (!(await verifyTurnstile(field(data, TURNSTILE_FIELD), ip))) {
    return {
      status: "error",
      message: "Please complete the check above the button and send again.",
    };
  }

  const { url, reason, details, email } = parsed.data;
  try {
    await fileAbuseReport({
      target: parseReportTarget(url),
      reason,
      details,
      reporterEmail: email,
      visitorHash: visitorHash(
        ip,
        requestHeaders.get("user-agent")?.slice(0, 512) ?? "",
        new Date(),
      ),
    });
  } catch (error) {
    console.error("Saving an abuse report failed:", error);
    return {
      status: "error",
      message:
        "We couldn't save your report. Please try again, or email support@qrdx.dev.",
    };
  }
  return { status: "success" };
}
