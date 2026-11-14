import type { NextRequest } from "next/server";
import {
  assertJson,
  MAX_BODY_BYTES,
  NO_STORE,
  resolveApiScope,
} from "@/app/api/v1/codes/_lib/api";
import { withApiUsage } from "@/lib/analytics/usage";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { barcodeIdSchema, updateBarcodeSchema } from "@/lib/barcodes/schema";
import {
  getBarcode,
  purgeBarcodes,
  trashBarcodes,
  updateBarcode,
} from "@/lib/barcodes/service";
import { HttpError, handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { serializeBarcode } from "../_lib/serialize";

type Context = { params: Promise<{ id: string }> };

async function barcodeId({ params }: Context): Promise<string> {
  return parseWithSchema(barcodeIdSchema, (await params).id);
}

const handleGET = withApiQuotaHeaders(
  async (req: NextRequest, context: Context) => {
    try {
      const scope = await resolveApiScope(req, "read");
      const saved = await getBarcode(scope, await barcodeId(context), {
        trashed: true,
      });
      return Response.json(
        { data: serializeBarcode(saved) },
        { headers: NO_STORE },
      );
    } catch (error) {
      return handleError(error, { route: "GET /api/v1/barcodes/[id]" });
    }
  },
);

/** Title, format, value, options and folder; options replace the saved ones. */
const handlePATCH = withApiQuotaHeaders(
  async (req: NextRequest, context: Context) => {
    try {
      const scope = await resolveApiScope(req, "write");
      assertJson(req);
      const id = await barcodeId(context);
      const patch = parseWithSchema(
        updateBarcodeSchema,
        await readJsonBody(req, MAX_BODY_BYTES),
      );
      const saved = await updateBarcode(scope, id, patch);
      return Response.json(
        { data: serializeBarcode(saved) },
        { headers: NO_STORE },
      );
    } catch (error) {
      return handleError(error, { route: "PATCH /api/v1/barcodes/[id]" });
    }
  },
);

/**
 * Moves the barcode to the trash, where the dashboard can restore it;
 * `?permanent=true` deletes it for good (in the trash or not).
 */
const handleDELETE = withApiQuotaHeaders(
  async (req: NextRequest, context: Context) => {
    try {
      const scope = await resolveApiScope(req, "write");
      const id = await barcodeId(context);
      const permanent = ["true", "1"].includes(
        req.nextUrl.searchParams.get("permanent") ?? "",
      );
      // A 404 for a barcode outside the workspace, before anything changes.
      const saved = await getBarcode(scope, id, { trashed: permanent });
      const result = permanent
        ? await purgeBarcodes(scope, [saved.id], { anywhere: true })
        : await trashBarcodes(scope, [saved.id]);
      if (result.updated === 0) {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only team owners and admins can delete barcodes created by others.",
        );
      }
      return Response.json(
        {
          data: permanent
            ? { id, deleted: true }
            : { id, deleted: false, trashed: true },
        },
        { headers: NO_STORE },
      );
    } catch (error) {
      return handleError(error, { route: "DELETE /api/v1/barcodes/[id]" });
    }
  },
);

// Counted with the API's requests (lib/analytics/usage.ts).
export const GET = withApiUsage("barcodes", handleGET);
export const PATCH = withApiUsage("barcodes", handlePATCH);
export const DELETE = withApiUsage("barcodes", handleDELETE);
