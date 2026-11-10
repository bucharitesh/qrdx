import type { NextRequest } from "next/server";
import { barcodeFileStem, parseBarcodeFileType } from "@/lib/barcode/files";
import { BarcodeRenderError, renderBarcodeFile } from "@/lib/barcode/server";
import { getBarcode } from "@/lib/barcodes/service";
import { HttpError, handleError } from "@/lib/error-response";
import { getActiveScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * A saved barcode as a file, for the dashboard's Download menu: the browser
 * session's workspace, no API quota. ?type=png|jpg|webp|avif|svg|pdf|eps.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await getActiveScope(request.headers);
    const { id } = await params;
    const type = parseBarcodeFileType(
      request.nextUrl.searchParams.get("type") ?? "png",
    );
    if (!type) {
      throw new HttpError(400, "VALIDATION_ERROR", "Unknown file type.");
    }
    const saved = await getBarcode(scope, id, { trashed: true });
    let file: Awaited<ReturnType<typeof renderBarcodeFile>>;
    try {
      file = await renderBarcodeFile(
        saved.format,
        saved.value,
        saved.options,
        type,
      );
    } catch (error) {
      if (error instanceof BarcodeRenderError) {
        throw new HttpError(400, "VALIDATION_ERROR", error.message);
      }
      throw error;
    }
    const filename = `${barcodeFileStem(saved.format, saved.value)}.${file.extension}`;
    return new Response(file.body as BodyInit, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleError(error, { route: "dashboard/barcodes/download" });
  }
}
