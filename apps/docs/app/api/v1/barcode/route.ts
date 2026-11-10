import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { barcodeFileStem, parseBarcodeFileType } from "@/lib/barcode/files";
import {
  type BarcodeIssue,
  barcodeImageBodySchema,
  barcodeImageQuerySchema,
  parseBarcodeFormat,
  type ResolvedBarcodeRequest,
  resolveBarcodeRequest,
} from "@/lib/barcode/request";
import { BarcodeRenderError, renderBarcodeFile } from "@/lib/barcode/server";
import { HttpError, handleError } from "@/lib/error-response";
import {
  enforceRateLimits,
  getClientIp,
  readJsonBody,
} from "@/lib/request-guards";
import { ValidationError } from "@/types/errors";

// GET /v1/barcode: a static barcode image from the query, no key, like
// GET /v1/qr (same per-IP limit, caching, CORS and error shape). POST takes
// the same fields as JSON, for values that shouldn't sit in a URL; the
// generator uses it for WebP and AVIF, which browsers can't encode.

const ipRateLimiter = createRateLimiter({
  limiter: slidingWindow(300, "60 s"),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

// Same query → same bytes, so responses can be cached forever.
const IMMUTABLE = "public, max-age=31536000, immutable";
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
const MAX_BODY_BYTES = 16 * 1024;

type Where = "query" | "body";

const invalid = (details: BarcodeIssue[], where: Where) =>
  new ValidationError(
    where === "query" ? "Invalid query parameters" : "Invalid request body",
    details,
  );

function zodIssues(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((issue) => ({
    param: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/** Case-insensitive enums and spellings people write ("EAN-13", "jpeg"). */
function normalize(raw: Record<string, unknown>) {
  const out = { ...raw };
  if (typeof out.format === "string") {
    out.format = parseBarcodeFormat(out.format) ?? out.format;
  }
  if (typeof out.type === "string") {
    out.type = parseBarcodeFileType(out.type) ?? out.type.toLowerCase();
  }
  return out;
}

function resolved(
  parsed: Parameters<typeof resolveBarcodeRequest>[0],
  where: Where,
): ResolvedBarcodeRequest {
  const result = resolveBarcodeRequest(parsed);
  if (!result.ok) throw invalid(result.issues, where);
  return result.request;
}

async function image(
  request: ResolvedBarcodeRequest,
  cache: Record<string, string>,
  where: Where,
): Promise<Response> {
  let file: Awaited<ReturnType<typeof renderBarcodeFile>>;
  try {
    file = await renderBarcodeFile(
      request.format,
      request.value,
      request.style,
      request.type,
    );
  } catch (error) {
    if (error instanceof BarcodeRenderError) {
      throw invalid(
        [
          {
            param: /px limit/.test(error.message) ? "scale" : "data",
            message: error.message,
          },
        ],
        where,
      );
    }
    throw error;
  }
  const filename = `${barcodeFileStem(request.format, request.value)}.${file.extension}`;
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    ...cache,
    "Content-Type": file.contentType,
    "Content-Disposition": `${request.type === "eps" ? "attachment" : "inline"}; filename="${filename}"`,
    "X-Content-Type-Options": "nosniff",
  };
  // Opened directly, the SVG may not run scripts or load anything.
  if (request.type === "svg") headers["Content-Security-Policy"] = SVG_CSP;
  return new Response(file.body as BodyInit, { headers });
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

const limit = (req: Request) =>
  enforceRateLimits([
    { limiter: ipRateLimiter, key: `barcode-image:ip:${getClientIp(req)}` },
  ]);

export async function GET(req: NextRequest) {
  try {
    await limit(req);
    const parsed = barcodeImageQuerySchema.safeParse(
      normalize(Object.fromEntries(req.nextUrl.searchParams)),
    );
    if (!parsed.success) {
      throw invalid(zodIssues(parsed.error.issues), "query");
    }
    return await image(
      resolved(parsed.data, "query"),
      { "Cache-Control": IMMUTABLE, "CDN-Cache-Control": IMMUTABLE },
      "query",
    );
  } catch (error) {
    return withCors(handleError(error, { route: "/api/v1/barcode" }));
  }
}

export async function POST(req: NextRequest) {
  try {
    await limit(req);
    const type = req.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("application/json")) {
      throw new HttpError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Send a JSON body with Content-Type: application/json.",
      );
    }
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("Invalid request body", [
        { param: "body", message: "Send a JSON object" },
      ]);
    }
    const parsed = barcodeImageBodySchema.safeParse(
      normalize(body as Record<string, unknown>),
    );
    if (!parsed.success) throw invalid(zodIssues(parsed.error.issues), "body");
    // A POST body may hold what shouldn't be cached anywhere.
    return await image(
      resolved(parsed.data, "body"),
      { "Cache-Control": "no-store" },
      "body",
    );
  } catch (error) {
    return withCors(handleError(error, { route: "POST /api/v1/barcode" }));
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
