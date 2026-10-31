import { MAX_IMPORT_ROWS } from "@/app/dashboard/codes/import/_lib/csv";
import { providerWriteLimiter } from "@/lib/connected-accounts/server";
import { dataErrorResponse, jsonError, requireUser } from "@/lib/data-connections/http";
import { listSourceItems } from "@/lib/data-connections/server";

type RouteContext = { params: Promise<{ provider: string }> };

function csvCell(value: string): string {
  // Spreadsheet formula injection: product titles stay plain text.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * GET /api/integrations/sources/shopify/export — every active product as a
 * CSV in the bulk importer's format (destination, title, folder, tags), so
 * Dashboard → Import makes one dynamic code per product.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { provider } = await context.params;
  if (provider !== "shopify") {
    return jsonError(404, "NOT_FOUND", "Bulk export is available for Shopify.");
  }
  const user = await requireUser(providerWriteLimiter, "integrations:shopify-export");
  if ("response" in user) return user.response;

  try {
    const rows: string[][] = [];
    let cursor: string | undefined;
    do {
      const page = await listSourceItems(user.userId, provider, { cursor });
      for (const item of page.items) {
        if (rows.length >= MAX_IMPORT_ROWS) break;
        rows.push([item.url, item.title.slice(0, 100), "Shopify", "shopify"]);
      }
      cursor = page.nextCursor;
    } while (cursor && rows.length < MAX_IMPORT_ROWS);

    const csv = [["destination", "title", "folder", "tags"], ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const date = new Date().toISOString().slice(0, 10);
    return new Response(`﻿${csv}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="qrdx-shopify-products-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return dataErrorResponse(error, {
      userId: user.userId,
      provider,
      action: "export",
    });
  }
}
