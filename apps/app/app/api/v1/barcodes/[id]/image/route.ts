import type { NextRequest } from "next/server";
import { resolveApiScope } from "@/app/api/v1/codes/_lib/api";
import { withApiUsage } from "@/lib/analytics/usage";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { barcodeFileStem, parseBarcodeFileType } from "@/lib/barcode/files";
import { BarcodeRenderError, renderBarcodeFile } from "@/lib/barcode/server";
import { barcodeIdSchema } from "@/lib/barcodes/schema";
import { getBarcode } from "@/lib/barcodes/service";
import { handleError } from "@/lib/error-response";
import { parseWithSchema } from "@/lib/request-guards";
import { ValidationError } from "@/types/errors";

type Context = { params: Promise<{ id: string }> };

const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

/**
 * A saved barcode as an image or vector file (`type`, default svg), drawn as
 * saved; `scale` overrides its raster scale. Private: needs the key.
 */
const handleGET = withApiQuotaHeaders(
  async (req: NextRequest, context: Context) => {
    try {
      const scope = await resolveApiScope(req, "read");
      const id = parseWithSchema(barcodeIdSchema, (await context.params).id);
      const params = req.nextUrl.searchParams;
      const type = parseBarcodeFileType(params.get("type") ?? "svg");
      if (!type) {
        throw new ValidationError("Invalid query parameters", [
          {
            param: "type",
            message: "Must be svg, png, jpg, webp, avif, pdf or eps",
          },
        ]);
      }
      const rawScale = params.get("scale");
      const scale = rawScale === null ? null : Number(rawScale);
      if (
        scale !== null &&
        !(Number.isInteger(scale) && scale >= 1 && scale <= 10)
      ) {
        throw new ValidationError("Invalid query parameters", [
          { param: "scale", message: "Must be a whole number from 1 to 10" },
        ]);
      }
      const saved = await getBarcode(scope, id, { trashed: true });
      const style = scale ? { ...saved.options, scale } : saved.options;
      let file: Awaited<ReturnType<typeof renderBarcodeFile>>;
      try {
        file = await renderBarcodeFile(saved.format, saved.value, style, type);
      } catch (error) {
        if (error instanceof BarcodeRenderError) {
          throw new ValidationError("Invalid query parameters", [
            {
              param: /px limit/.test(error.message) ? "scale" : "value",
              message: error.message,
            },
          ]);
        }
        throw error;
      }
      const filename = `${barcodeFileStem(saved.format, saved.value)}.${file.extension}`;
      return new Response(file.body as BodyInit, {
        headers: {
          "Content-Type": file.contentType,
          "Content-Disposition": `${type === "eps" ? "attachment" : "inline"}; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          ...(type === "svg" ? { "Content-Security-Policy": SVG_CSP } : {}),
        },
      });
    } catch (error) {
      return handleError(error, { route: "GET /api/v1/barcodes/[id]/image" });
    }
  },
);

// Counted with the API's requests (lib/analytics/usage.ts).
export const GET = withApiUsage("barcodes", handleGET);
