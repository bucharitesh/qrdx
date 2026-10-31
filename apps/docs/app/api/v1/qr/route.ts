import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/error-response";
import {
  QR_DEFAULTS,
  QR_MARGIN_MAX,
  QR_SIZE_MAX,
  QR_SIZE_MIN,
  QR_TEMPLATE_IDS,
  QrDataTooLongError,
  qrImageFormats,
  qrOptionsSchema,
  renderQrPng,
  renderQrSvg,
} from "@/lib/qr-render";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { ValidationError } from "@/types/errors";

const ipRateLimiter = createRateLimiter({
  limiter: slidingWindow(300, "60 s"),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

// Same query → same bytes, so responses can be cached forever.
const IMMUTABLE = "public, max-age=31536000, immutable";

const querySchema = qrOptionsSchema.extend({
  format: z.enum(qrImageFormats).default("svg"),
  size: z.coerce
    .number()
    .int()
    .min(QR_SIZE_MIN)
    .max(QR_SIZE_MAX)
    .default(QR_DEFAULTS.size),
  margin: z.coerce
    .number()
    .int()
    .min(0)
    .max(QR_MARGIN_MAX)
    .default(QR_DEFAULTS.margin),
});

const templateIdsByLowercase = new Map(
  QR_TEMPLATE_IDS.map((id) => [id.toLowerCase(), id]),
);

function parseQuery(searchParams: URLSearchParams) {
  const raw: Record<string, string> = Object.fromEntries(searchParams);
  // Case-insensitive enums for hand-written URLs.
  if (raw.level) raw.level = raw.level.toUpperCase();
  if (raw.format) raw.format = raw.format.toLowerCase();
  if (raw.template) {
    raw.template =
      templateIdsByLowercase.get(raw.template.toLowerCase()) ?? raw.template;
  }

  const result = querySchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      "Invalid query parameters",
      result.error.issues.map((issue) => ({
        param: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

export async function GET(req: NextRequest) {
  try {
    await enforceRateLimits([
      { limiter: ipRateLimiter, key: `qr-image:ip:${getClientIp(req)}` },
    ]);

    const { format, ...options } = parseQuery(req.nextUrl.searchParams);
    const headers = {
      ...CORS_HEADERS,
      "Cache-Control": IMMUTABLE,
      "CDN-Cache-Control": IMMUTABLE,
      "X-Content-Type-Options": "nosniff",
    };

    if (format === "png") {
      const png = await renderQrPng(options);
      return new Response(png, {
        headers: { ...headers, "Content-Type": "image/png" },
      });
    }

    return new Response(renderQrSvg(options), {
      headers: {
        ...headers,
        "Content-Type": "image/svg+xml",
        // Opened directly, the SVG may not run scripts or load anything.
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      },
    });
  } catch (error) {
    if (error instanceof QrDataTooLongError) {
      return withCors(
        handleError(
          new ValidationError("Invalid query parameters", [
            { param: "data", message: error.message },
          ]),
        ),
      );
    }
    return withCors(handleError(error, { route: "/api/v1/qr" }));
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
