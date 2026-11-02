import type { NextRequest } from "next/server";
import {
  createCodeSchema,
  createCodes,
  enforceCreateRateLimit,
  listCodes,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import {
  assertJson,
  MAX_BODY_BYTES,
  NO_STORE,
  resolveApiScope,
  serializeCode,
} from "./_lib/api";
import { createCodesBatchSchema, listCodesQuerySchema } from "./_lib/schemas";

export const GET = withApiQuotaHeaders(async (req: NextRequest) => {
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

export const POST = withApiQuotaHeaders(async (req: NextRequest) => {
  try {
    const scope = await resolveApiScope(req, "write");
    assertJson(req);
    const raw = await readJsonBody(req, MAX_BODY_BYTES);
    const body = Array.isArray(raw)
      ? parseWithSchema(createCodesBatchSchema, raw)
      : parseWithSchema(createCodeSchema, raw);
    await enforceCreateRateLimit(scope.userId);

    const isBatch = Array.isArray(body);
    const codes = await createCodes(scope, isBatch ? body : [body]);

    return Response.json(
      { data: isBatch ? codes.map(serializeCode) : serializeCode(codes[0]) },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "POST /api/v1/codes" });
  }
});
