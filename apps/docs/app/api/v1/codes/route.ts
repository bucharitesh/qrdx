import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  createCodeSchema,
  createCodes,
  enforceCreateRateLimit,
  listCodes,
  MAX_BULK_CREATE,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import {
  assertJson,
  MAX_BODY_BYTES,
  NO_STORE,
  resolveApiScope,
  serializeCode,
} from "./_lib/api";

const listQuerySchema = z.object({
  status: z.enum(["active", "archived", "all"]).default("active"),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

/**
 * Up to 100 codes in one request (arrays of more than one need Pro). Arrays
 * and single objects are parsed separately: a union would collapse a bad
 * destination into a bare "Invalid input" and hide the reason from callers.
 */
const createBatchSchema = z.array(createCodeSchema).min(1).max(MAX_BULK_CREATE);

export async function GET(req: NextRequest) {
  try {
    const scope = await resolveApiScope(req, "read");
    const query = parseWithSchema(
      listQuerySchema,
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
}

export async function POST(req: NextRequest) {
  try {
    const scope = await resolveApiScope(req, "write");
    assertJson(req);
    const raw = await readJsonBody(req, MAX_BODY_BYTES);
    const body = Array.isArray(raw)
      ? parseWithSchema(createBatchSchema, raw)
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
}
