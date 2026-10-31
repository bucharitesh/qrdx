import { createHash } from "node:crypto";
import { conversion, database as db, qrCode } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { resolveApiScope } from "@/app/api/v1/codes/_lib/api";
import { HttpError, handleError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { parsePixelConfig, verifyScanToken } from "@/lib/redirect/routing";
import {
  enforceRateLimits,
  getClientIp,
  parseWithSchema,
  readJsonBody,
} from "@/lib/request-guards";
import { type ActiveScope, isInScope } from "@/lib/scope";

/**
 * POST /api/v1/conversions — attributes a conversion (sale, sign-up, …) to the
 * scan that brought the visitor (Business).
 *
 * - Browser (public/conversions.js, any origin, no credentials): needs the
 *   signed `sid` the redirect appended as `qrdx_sid`, and conversion tracking
 *   turned on for the code.
 * - Server: `Authorization: Bearer <token>` (scope codes:write) with `sid`, or
 *   `code` (a code id of the token's workspace) when no scan is known.
 *
 * An `id` (order id, …) makes retries idempotent.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const MAX_BODY_BYTES = 8 * 1024;
const MAX_METADATA_KEYS = 20;

const valueSchema = z
  .union([z.number(), z.string().trim()])
  .transform((value, ctx) => {
    const text = typeof value === "number" ? value.toFixed(2) : value;
    if (
      !/^\d{1,12}(?:\.\d{1,2})?$/.test(text) ||
      (typeof value === "number" && !(Number.isFinite(value) && value >= 0))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "value must be a non-negative amount with up to 2 decimals",
      });
      return z.NEVER;
    }
    return text;
  });

const bodySchema = z.object({
  sid: z.string().max(200).optional(),
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(
      /^[\p{L}\p{N} _.:/-]+$/u,
      "name: letters, numbers, spaces and _ . : / -",
    )
    .default("conversion"),
  value: valueSchema.optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code like USD")
    .optional(),
  id: z.string().trim().min(1).max(128).optional(),
  metadata: z
    .record(
      z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/),
      z.union([z.string().max(200), z.number(), z.boolean(), z.null()]),
    )
    .refine((value) => Object.keys(value).length <= MAX_METADATA_KEYS, {
      message: `metadata can have up to ${MAX_METADATA_KEYS} keys`,
    })
    .optional(),
});

const ipLimiter = createRateLimiter({ limiter: slidingWindow(60, "60 s") });
const scanLimiter = createRateLimiter({ limiter: slidingWindow(10, "60 m") });
const codeLimiter = createRateLimiter({ limiter: slidingWindow(600, "60 s") });

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

const json = (status: number, body: unknown) =>
  withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

export function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  try {
    const isServer = request.headers
      .get("authorization")
      ?.startsWith("Bearer ");
    let scope: ActiveScope | null = null;
    if (isServer) {
      scope = await resolveApiScope(request, "write");
    } else {
      await enforceRateLimits([
        { limiter: ipLimiter, key: `conversions:ip:${getClientIp(request)}` },
      ]);
    }

    const body = parseWithSchema(
      bodySchema,
      await readJsonBody(request, MAX_BODY_BYTES),
    );

    let codeId: string;
    let scanId: string | null = null;
    if (body.sid) {
      const token = verifyScanToken(body.sid);
      if (!token) {
        throw new HttpError(
          404,
          "INVALID_SID",
          "Unknown or expired qrdx_sid (scans can be attributed for 30 days).",
        );
      }
      codeId = token.codeId;
      scanId = token.scanId;
    } else if (scope && body.code) {
      codeId = body.code;
    } else {
      throw new HttpError(
        400,
        "SID_REQUIRED",
        scope
          ? "Send the qrdx_sid of the scan, or the code id as `code`."
          : "Send the qrdx_sid the QR code added to your page URL.",
      );
    }

    const [code] = await db
      .select({
        id: qrCode.id,
        userId: qrCode.userId,
        organizationId: qrCode.organizationId,
        pixels: qrCode.pixels,
      })
      .from(qrCode)
      .where(eq(qrCode.id, codeId))
      .limit(1);
    if (!code || (scope && !isInScope(scope, code))) {
      throw new HttpError(404, "NOT_FOUND", "QR code not found.");
    }
    if (!(scope || parsePixelConfig(code.pixels)?.conversions)) {
      throw new HttpError(
        403,
        "CONVERSIONS_OFF",
        "Conversion tracking is turned off for this QR code.",
      );
    }
    const limits = getPlanLimits(
      await getPlanForScope({
        userId: code.userId,
        organizationId: code.organizationId,
      }),
    );
    if (!limits.conversions) {
      throw new HttpError(
        402,
        "PLAN_REQUIRED",
        "Conversion tracking is part of the Business plan.",
      );
    }

    await enforceRateLimits([
      { limiter: codeLimiter, key: `conversions:code:${code.id}` },
      ...(scanId && !scope
        ? [{ limiter: scanLimiter, key: `conversions:scan:${scanId}` }]
        : []),
    ]);

    // With an `id`, the row id is derived from it so a retry inserts nothing.
    const id = body.id
      ? `cv_${createHash("sha256").update(`${code.id}\n${body.id}`).digest("hex").slice(0, 32)}`
      : cuid();
    const metadata = {
      ...body.metadata,
      ...(body.id ? { externalId: body.id } : {}),
      source: scope ? "api" : "browser",
    };
    const inserted = await db
      .insert(conversion)
      .values({
        id,
        qrCodeId: code.id,
        scanId,
        name: body.name,
        value: body.value ?? null,
        currency: body.value
          ? (body.currency ?? "USD")
          : (body.currency ?? null),
        metadata,
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: conversion.id })
      .returning({ id: conversion.id });

    return json(inserted.length > 0 ? 201 : 200, {
      id,
      codeId: code.id,
      scanId,
      duplicate: inserted.length === 0,
    });
  } catch (error) {
    return withCors(handleError(error, { route: "api/v1/conversions" }));
  }
}
