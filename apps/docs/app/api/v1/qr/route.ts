import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import { CommunityItemError } from "@/lib/community/api";
import { handleError } from "@/lib/error-response";
import {
  type FlatStyle,
  type RenderRequest,
  renderStyledEps,
  renderStyledPng,
  renderStyledSvg,
  renderStyledWebp,
  resolveRender,
} from "@/lib/qr-api/render";
import { type ApiStyle, parseStyleQuery } from "@/lib/qr-api/style";
import {
  QR_TEMPLATE_IDS,
  QrDataTooLongError,
  renderQrEps,
  renderQrPng,
  renderQrSvg,
  renderQrWebp,
} from "@/lib/qr-render";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { ValidationError } from "@/types/errors";
import { optionalApiKeyCaller } from "../codes/_lib/api";
import { qrImageQuerySchema, STYLED_PARAMS } from "./_lib/query";

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
// A community item can get a new version or be taken down.
const ITEM_CACHE = "public, max-age=300, stale-while-revalidate=3600";
const ITEM_CDN_CACHE = "public, max-age=600, stale-while-revalidate=3600";
// A logo by file id is the workspace's own image, read with its key.
const PRIVATE = "private, no-store";

const FLAT_PARAMS = [
  "fg",
  "bg",
  "eyeColor",
  "dotColor",
  "body",
  "eye",
  "dot",
  "level",
  "margin",
  "template",
] as const;

const templateIdsByLowercase = new Map(
  QR_TEMPLATE_IDS.map((id) => [id.toLowerCase(), id]),
);

const invalid = (param: string, message: string) =>
  new ValidationError("Invalid query parameters", [{ param, message }]);

function parseQuery(searchParams: URLSearchParams) {
  const raw: Record<string, string> = Object.fromEntries(searchParams);
  // Case-insensitive enums for hand-written URLs.
  if (raw.level) raw.level = raw.level.toUpperCase();
  if (raw.format) raw.format = raw.format.toLowerCase();
  if (raw.template) {
    raw.template =
      templateIdsByLowercase.get(raw.template.toLowerCase()) ?? raw.template;
  }
  if (raw.frame) raw.frame = raw.frame.toLowerCase();
  if (raw.item) raw.item = raw.item.toLowerCase();

  const result = qrImageQuerySchema.safeParse(raw);
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

type Query = ReturnType<typeof parseQuery>;

/** The `style` value plus the frame and logo parameters, as one style. */
function styleLayer(query: Query): ApiStyle | undefined {
  let style: ApiStyle | undefined;
  if (query.style !== undefined) {
    const parsed = parseStyleQuery(query.style);
    if (!parsed.ok) {
      throw new ValidationError(
        "Invalid query parameters",
        parsed.issues.map((issue) => ({
          param: issue.path,
          message: issue.message,
        })),
      );
    }
    style = parsed.style;
  }
  if (query.frame) {
    style = {
      ...style,
      frame: {
        style: query.frame as Exclude<
          NonNullable<ApiStyle["frame"]>["style"],
          "custom"
        >,
        ...(query.frameText !== undefined ? { text: query.frameText } : {}),
      },
    };
  }
  if (query.logoIcon) style = { ...style, logoIcon: query.logoIcon };
  if (query.logoFileId) style = { ...style, logoFileId: query.logoFileId };
  return style;
}

/** The flat parameters the URL actually sets (defaults left out). */
function flatOf(query: Query, searchParams: URLSearchParams): FlatStyle {
  const flat: Record<string, unknown> = {};
  for (const name of FLAT_PARAMS) {
    if (searchParams.has(name)) flat[name] = query[name];
  }
  return flat as FlatStyle;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

async function original(query: Query, headers: Record<string, string>) {
  const { format, ...options } = query;
  if (format === "png") {
    const png = await renderQrPng(options);
    return new Response(png, {
      headers: { ...headers, "Content-Type": "image/png" },
    });
  }
  if (format === "webp") {
    return new Response(new Uint8Array(await renderQrWebp(options)), {
      headers: { ...headers, "Content-Type": "image/webp" },
    });
  }
  if (format === "eps") {
    return new Response(await renderQrEps(options), {
      headers: {
        ...headers,
        "Content-Type": "application/postscript",
        "Content-Disposition": 'attachment; filename="qr-code.eps"',
      },
    });
  }
  return new Response(renderQrSvg(options), {
    headers: {
      ...headers,
      "Content-Type": "image/svg+xml",
      // Opened directly, the SVG may not run scripts or load anything.
      "Content-Security-Policy": SVG_CSP,
    },
  });
}

async function styled(req: NextRequest, query: Query) {
  const style = styleLayer(query);
  const needsKey = Boolean(style?.logoFileId);
  const caller = needsKey
    ? await optionalApiKeyCaller(req, "read", "A logo by file id")
    : null;
  const request: RenderRequest = {
    data: query.data,
    size: query.size,
    ...(query.item ? { item: query.item } : {}),
    ...(style ? { style } : {}),
    flat: flatOf(query, req.nextUrl.searchParams),
    scope: caller?.scope ?? null,
  };
  let render: Awaited<ReturnType<typeof resolveRender>>;
  try {
    render = await resolveRender(request);
  } catch (error) {
    if (error instanceof CommunityItemError) {
      throw invalid("item", error.message);
    }
    throw error;
  }
  // A frame label with no frame to draw it is a mistake worth naming.
  if (query.frameText !== undefined && !render.style.frame) {
    throw invalid(
      "frameText",
      "There's no frame to put it on: add frame, or a style or item with one",
    );
  }
  if (query.frameText !== undefined && render.style.frame && !query.frame) {
    render.style.frame = { ...render.style.frame, text: query.frameText };
  }

  const cache: Record<string, string> =
    render.logoSource === "file"
      ? { "Cache-Control": PRIVATE }
      : render.itemId
        ? { "Cache-Control": ITEM_CACHE, "CDN-Cache-Control": ITEM_CDN_CACHE }
        : { "Cache-Control": IMMUTABLE, "CDN-Cache-Control": IMMUTABLE };
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    ...cache,
    ...(needsKey ? { Vary: "Authorization" } : {}),
    "X-Content-Type-Options": "nosniff",
  };

  if (query.format === "png") {
    const png = await renderStyledPng(render);
    return new Response(png as BodyInit, {
      headers: { ...headers, "Content-Type": "image/png" },
    });
  }
  if (query.format === "webp") {
    return new Response(new Uint8Array(await renderStyledWebp(render)), {
      headers: { ...headers, "Content-Type": "image/webp" },
    });
  }
  if (query.format === "eps") {
    return new Response(await renderStyledEps(render), {
      headers: {
        ...headers,
        "Content-Type": "application/postscript",
        "Content-Disposition": 'attachment; filename="qr-code.eps"',
      },
    });
  }
  return new Response(renderStyledSvg(render), {
    headers: {
      ...headers,
      "Content-Type": "image/svg+xml",
      "Content-Security-Policy": SVG_CSP,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    await enforceRateLimits([
      { limiter: ipRateLimiter, key: `qr-image:ip:${getClientIp(req)}` },
    ]);

    const searchParams = req.nextUrl.searchParams;
    const query = parseQuery(searchParams);
    if (STYLED_PARAMS.some((name) => searchParams.has(name))) {
      return await styled(req, query);
    }
    return await original(query, {
      ...CORS_HEADERS,
      "Cache-Control": IMMUTABLE,
      "CDN-Cache-Control": IMMUTABLE,
      "X-Content-Type-Options": "nosniff",
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
