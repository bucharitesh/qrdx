import type { NextRequest } from "next/server";
import {
  assertJson,
  MAX_BODY_BYTES,
  NO_STORE,
  resolveApiScope,
} from "@/app/api/v1/codes/_lib/api";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import {
  createBarcodeSchema,
  listBarcodesQuerySchema,
} from "@/lib/barcodes/schema";
import { createBarcode, listBarcodes } from "@/lib/barcodes/service";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { serializeBarcode } from "./_lib/serialize";

// Saved barcodes of the workspace the key acts on. Same credentials, scopes
// (codes:read, codes:write), per-minute limits and daily quota as /v1/codes.

export const GET = withApiQuotaHeaders(async (req: NextRequest) => {
  try {
    const scope = await resolveApiScope(req, "read");
    const query = parseWithSchema(
      listBarcodesQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams),
    );
    const { barcodes, total } = await listBarcodes(scope, query);
    return Response.json(
      {
        data: barcodes.map(serializeBarcode),
        pagination: { total, limit: query.limit, offset: query.offset },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "GET /api/v1/barcodes" });
  }
});

export const POST = withApiQuotaHeaders(async (req: NextRequest) => {
  try {
    const scope = await resolveApiScope(req, "write");
    assertJson(req);
    const body = parseWithSchema(
      createBarcodeSchema,
      await readJsonBody(req, MAX_BODY_BYTES),
    );
    const saved = await createBarcode(scope, body);
    return Response.json(
      { data: serializeBarcode(saved) },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "POST /api/v1/barcodes" });
  }
});
