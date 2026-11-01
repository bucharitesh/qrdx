import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { CUSTOM_DOMAIN_HEADER } from "@/app/dashboard/domains/_lib/hostname";
import { trackServer } from "@/lib/analytics/server";
import { env } from "@/lib/env";
import { HttpError, handleError } from "@/lib/error-response";
import { emitFormSubmitted } from "@/lib/events";
import { validateAnswers } from "@/lib/landing/blocks/form-fields";
import {
  enforceRateLimits,
  getClientIp,
  parseWithSchema,
  readJsonBody,
} from "@/lib/request-guards";
import { visitorHash } from "@/lib/scans";
import {
  insertFormResponse,
  isAcceptingResponses,
  isFormOpen,
  loadLiveForm,
} from "../_lib/responses";
import {
  answersToEventFields,
  MAX_SUBMISSION_BYTES,
  pageIdParamSchema,
  submissionSchema,
} from "../_lib/submission";
import { verifyTurnstile } from "../_lib/turnstile";

// Public endpoint for form blocks on hosted pages (/p/<slug>, also on custom
// domains, where proxy.ts passes /api/forms/* through). Same-origin only: no
// CORS headers, so other sites can't post here from a browser.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ pageId: string }> };

// One visitor: a few submissions a minute per form; a burst of forms per IP.
const submitPerFormLimiter = createRateLimiter({
  limiter: slidingWindow(5, "60 s"),
});
const submitPerIpLimiter = createRateLimiter({
  limiter: slidingWindow(30, "600 s"),
});
const statusLimiter = createRateLimiter({ limiter: slidingWindow(60, "60 s") });

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

const notFound = () =>
  new HttpError(404, "NOT_FOUND", "This form is no longer available.");

const formClosed = () =>
  new HttpError(
    403,
    "FORM_CLOSED",
    "This form isn't accepting responses right now.",
  );

function parsePageId(value: string): string {
  const result = pageIdParamSchema.safeParse(value);
  if (!result.success) throw notFound();
  return result.data;
}

/** Whether the form accepts responses (checked on the visitor's first interaction). */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const pageId = parsePageId((await params).pageId);
    const blockId = request.nextUrl.searchParams.get("block") ?? "";
    await enforceRateLimits([
      {
        limiter: statusLimiter,
        key: `forms:status:ip:${getClientIp(request)}`,
      },
    ]);
    const form = /^[A-Za-z0-9_-]{1,64}$/.test(blockId)
      ? await loadLiveForm(pageId, blockId, {
          customDomainId: request.headers.get(CUSTOM_DOMAIN_HEADER),
        })
      : null;
    if (!form) throw notFound();
    // Paused, scheduled, expired or still locked: same answer as a submit.
    if (!(await isFormOpen(form))) throw formClosed();
    return json({ accepting: await isAcceptingResponses(form) });
  } catch (error) {
    return handleError(error, { route: "api/forms/status" });
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const pageId = parsePageId((await params).pageId);
    const ip = getClientIp(request);
    await enforceRateLimits([
      { limiter: submitPerFormLimiter, key: `forms:submit:${pageId}:${ip}` },
      { limiter: submitPerIpLimiter, key: `forms:submit:ip:${ip}` },
    ]);

    const body = parseWithSchema(
      submissionSchema,
      await readJsonBody(request, MAX_SUBMISSION_BYTES),
    );
    const form = await loadLiveForm(pageId, body.block, {
      customDomainId: request.headers.get(CUSTOM_DOMAIN_HEADER),
      qrCodeId: body.qrCodeId,
    });
    if (!form) throw notFound();
    // The page's lifecycle (password, schedule, pause) applies to its forms.
    if (!(await isFormOpen(form))) throw formClosed();

    // Honeypot filled: look successful so the bot moves on, store nothing.
    if (body.hp) return json({ ok: true }, 201);

    const secret = env.TURNSTILE_SECRET_KEY;
    if (secret && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      const check = await verifyTurnstile({ token: body.token, secret, ip });
      // "unavailable" (Cloudflare down or misconfigured) lets the response
      // through: rate limits and the honeypot still apply.
      if (!check.ok && check.reason !== "unavailable") {
        throw new HttpError(
          400,
          "VERIFICATION_FAILED",
          "The security check failed. Please try again.",
        );
      }
    }

    const result = validateAnswers(form.fields, body.answers);
    if (!result.success) {
      return json(
        {
          code: "VALIDATION_ERROR",
          message: "Some answers need another look.",
          data: { fields: result.errors },
          status: 400,
        },
        400,
      );
    }
    if (result.answers.length === 0) {
      throw new HttpError(
        400,
        "EMPTY_RESPONSE",
        "Answer at least one question before sending.",
      );
    }

    const scope = { userId: form.userId, organizationId: form.organizationId };
    if (!(await isAcceptingResponses(scope))) throw formClosed();

    const now = new Date();
    const ua = request.headers.get("user-agent")?.slice(0, 512) ?? "";
    const responseId = await insertFormResponse({
      pageId: form.pageId,
      qrCodeId: form.code?.id ?? null,
      data: { block: body.block, answers: result.answers },
      visitorHash: ip === "unknown" ? null : visitorHash(ip, ua, now),
      createdAt: now,
    });

    emitFormSubmitted(scope, {
      responseId,
      page: { id: form.pageId, title: form.pageTitle },
      code: form.code,
      fields: answersToEventFields(result.answers),
      submittedAt: now,
    });
    // A count only: nothing about the visitor, the page or the answers.
    trackServer("form_submitted", {});

    return json({ ok: true }, 201);
  } catch (error) {
    return handleError(error, { route: "api/forms/submit" });
  }
}
