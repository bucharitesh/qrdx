import type { NextRequest } from "next/server";
import {
  createCodeSchema,
  createCodesBatch,
  enforceCreateRateLimit,
  listCodes,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getDefaultThemeStyle } from "@/app/(app)/dashboard/themes/_lib/queries";
import { withApiUsage } from "@/lib/analytics/usage";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { HttpError, handleError } from "@/lib/error-response";
import { formatCount } from "@/lib/format-count";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { ValidationError } from "@/types/errors";
import {
  assertJson,
  MAX_BODY_BYTES,
  NO_STORE,
  resolveApiScope,
  serializeCode,
  serializeMinimalCode,
} from "./_lib/api";
import {
  createCodesBatchSchema,
  createCodesHeadersSchema,
  listCodesQuerySchema,
} from "./_lib/schemas";
import { resolveCodeStyles } from "./_lib/style";

// A batch of 1,000 codes: Web Risk lookups stop at SCREEN_BUDGET_MS, the
// inserts take a few seconds; well inside the Hobby plan's 60 s.
export const maxDuration = 60;

/** How long a batch waits for Web Risk before the offline checks take over. */
const SCREEN_BUDGET_MS = 20_000;
/** What a response can carry (the platform's limit is 4.5 MB). */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const handleGET = withApiQuotaHeaders(async (req: NextRequest) => {
  try {
    const scope = await resolveApiScope(req, "read");
    const query = parseWithSchema(
      listCodesQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams),
    );
    const { codes, total } = await listCodes(scope, query);

    return Response.json(
      {
        data: codes.map(serializeCode),
        pagination: { total, limit: query.limit, offset: query.offset },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "GET /api/v1/codes" });
  }
});

/** An array body: every invalid row, by index (nothing is created). */
function parseBatch(raw: unknown[]) {
  const result = createCodesBatchSchema.safeParse(raw);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => {
    const [first] = issue.path;
    return {
      ...(typeof first === "number" && { index: first }),
      path: issue.path.join("."),
      message: issue.message,
    };
  });
  const rows = new Set(details.flatMap((detail) => detail.index ?? []));
  throw new ValidationError(
    rows.size > 0 && raw.length > 1
      ? `${formatCount(rows.size)} of ${formatCount(raw.length)} codes have problems. Nothing was created; data.details lists each one by index.`
      : "Invalid request body",
    details,
  );
}

const handlePOST = withApiQuotaHeaders(async (req: NextRequest) => {
  try {
    const scope = await resolveApiScope(req, "write");
    assertJson(req);
    const headers = parseWithSchema(createCodesHeadersSchema, {
      "Idempotency-Key": req.headers.get("idempotency-key") ?? undefined,
      Prefer: /\breturn=minimal\b/i.test(req.headers.get("prefer") ?? "")
        ? "return=minimal"
        : undefined,
    });
    const minimal = headers.Prefer === "return=minimal";
    const raw = await resolveCodeStyles(
      scope,
      await readJsonBody(req, MAX_BODY_BYTES),
    );
    const isBatch = Array.isArray(raw);
    const inputs = isBatch
      ? parseBatch(raw)
      : [parseWithSchema(createCodeSchema, raw)];
    await enforceCreateRateLimit(scope.userId);

    // Each code comes back with its design: a default theme with an embedded
    // logo makes that large, so check before anything is created.
    if (isBatch && !minimal) {
      const defaultStyle = inputs.some((input) => !input.style)
        ? await getDefaultThemeStyle(scope)
        : null;
      const defaultBytes = JSON.stringify(defaultStyle).length;
      const bytes = inputs.reduce(
        (sum, input) =>
          sum +
          700 +
          input.destinationUrl.length +
          (input.title?.length ?? 0) +
          (input.style ? JSON.stringify(input.style).length : defaultBytes),
        0,
      );
      if (bytes > MAX_RESPONSE_BYTES) {
        throw new HttpError(
          413,
          "PAYLOAD_TOO_LARGE",
          `These ${formatCount(inputs.length)} codes would come back as about ${Math.ceil(bytes / 1024 / 1024)} MB, over the 4 MB a response can carry (each code returns its design, logo included). Send Prefer: return=minimal to get them without their design, or fewer codes per request. Nothing was created.`,
        );
      }
    }

    const { codes, created } = await createCodesBatch(scope, inputs, {
      idempotencyKey: headers["Idempotency-Key"] ?? null,
      screenBudgetMs: isBatch ? SCREEN_BUDGET_MS : undefined,
      via: "api",
    });
    const serialize = minimal ? serializeMinimalCode : serializeCode;

    return Response.json(
      { data: isBatch ? codes.map(serialize) : serialize(codes[0]) },
      {
        status: 201,
        headers: {
          ...NO_STORE,
          ...(headers["Idempotency-Key"] && {
            "Idempotent-Replayed": String(created === 0),
          }),
        },
      },
    );
  } catch (error) {
    return handleError(error, { route: "POST /api/v1/codes" });
  }
});

// Counted with the API's requests (lib/analytics/usage.ts).
export const GET = withApiUsage("codes", handleGET);
export const POST = withApiUsage("codes", handlePOST);
