import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  apiKeyRequiredError,
  optionalApiKeyCaller,
} from "@/app/api/v1/codes/_lib/api";
import { getBarcodeFormat } from "@/lib/barcode/formats";
import {
  BARCODE_FORMAT_IDS,
  barcodeImageBodySchema,
  parseBarcodeFormat,
  resolveBarcodeRequest,
} from "@/lib/barcode/request";
import { BarcodeRenderError, renderBarcodeFile } from "@/lib/barcode/server";
import { barcodeImageUrl } from "@/lib/barcode/url";
import { createBarcodeSchema } from "@/lib/barcodes/schema";
import { barcodeLabel, createBarcode } from "@/lib/barcodes/service";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { getPlanLimits } from "@/lib/plans";
import { workspaceHref } from "@/lib/workspace-paths";
import { workspaceSlug } from "@/lib/workspaces";

// The MCP server's barcode tools: generate_barcode draws one (no key, like
// GET /v1/barcode) and save_barcode keeps it in the key's workspace (like
// save_template saves a theme).

const text = (value: string) => ({ type: "text" as const, text: value });

type ToolContext = { http?: { req?: Request } };

function toolError(error: unknown) {
  if (error instanceof HttpError) {
    const body = {
      code: error.code,
      message: error.message,
      status: error.status,
    };
    return {
      isError: true,
      content: [text(error.message), text(JSON.stringify(body))],
      structuredContent: body,
    };
  }
  if (error instanceof BarcodeRenderError) {
    return { isError: true, content: [text(error.message)] };
  }
  return null;
}

const invalid = (issues: { param: string; message: string }[]) =>
  new HttpError(
    400,
    "VALIDATION_ERROR",
    issues.map((issue) => `${issue.param}: ${issue.message}`).join("; "),
  );

/** "EAN-13", "code-128" and other spellings, as the image API takes them. */
const formatInput = z
  .string()
  .max(40)
  .transform((value, ctx) => {
    const format = parseBarcodeFormat(value);
    if (!format) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown barcode format. Use one of: ${BARCODE_FORMAT_IDS.join(", ")}`,
      });
      return z.NEVER;
    }
    return format;
  })
  .describe(
    `The symbology: ${BARCODE_FORMAT_IDS.join(", ")} (EAN-13 and UPC-A for retail products, ITF-14 for cartons, GS1-128 for logistics labels, Code 128 for your own labels, Data Matrix, PDF417 and Aztec for 2D)`,
  );

const generateInput = barcodeImageBodySchema
  .omit({ type: true, format: true })
  .extend({
    format: formatInput,
    include_svg: z
      .boolean()
      .default(false)
      .describe(
        "Also return the SVG markup as text, e.g. to save an .svg file",
      ),
  });

const saveInput = createBarcodeSchema.omit({ format: true }).extend({
  format: formatInput,
});

const FREE_SAVED_BARCODES = getPlanLimits("free").savedBarcodes;

export const BARCODE_MCP_INSTRUCTIONS =
  " For barcodes (EAN-13, UPC-A, UPC-E, EAN-8, Code 128, Code 39, ITF-14, GS1-128, Data Matrix, PDF417, Aztec), call generate_barcode: it checks the value (check digits, lengths, characters) and returns a PNG plus public image URLs; with an API key, save_barcode keeps one in the workspace's Barcodes.";

export function registerBarcodeTools(server: McpServer) {
  server.registerTool(
    "generate_barcode",
    {
      title: "Generate a barcode",
      description:
        "Draw a static barcode: EAN-13, EAN-8, UPC-A, UPC-E, ITF-14 and GS1-128 (check digits added or verified), Code 128, Code 39, or the 2D Data Matrix, PDF417 and Aztec. Checks the value against the format's rules (characters, length, check digit) and says what it added. Options: bar and background colors, bar height, quiet zone, scale, the text under the bars and rotation. Returns a PNG and public image URLs (SVG, PNG, JPG, WebP, AVIF, PDF and EPS) for embedding or printing. No account needed.",
      inputSchema: generateInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        title: "Generate a barcode",
      },
    },
    async (input) => {
      try {
        const resolved = resolveBarcodeRequest({ ...input, type: "png" });
        if (!resolved.ok) throw invalid(resolved.issues);
        const { format, value, note, style } = resolved.request;
        const png = await renderBarcodeFile(format, value, style, "png");
        const svg = input.include_svg
          ? await renderBarcodeFile(format, value, style, "svg")
          : null;
        const url = (type: Parameters<typeof barcodeImageUrl>[4]) =>
          barcodeImageUrl(baseUrl, format, value, style, type);
        const label = getBarcodeFormat(format).label;
        const lines = [
          `${label} barcode for ${value}${note ? ` (${note})` : ""}, ${png.width}x${png.height}px.`,
          `SVG URL: ${url("svg")}`,
          `PNG URL: ${url("png")}`,
          `PDF URL (vector, for print): ${url("pdf")}`,
          `Other files: add type=jpg, webp, avif or eps to the URL.`,
          `Markdown: ![${label} barcode](${url("svg")})`,
        ];
        const content = [
          text(lines.join("\n")),
          {
            type: "image" as const,
            data: Buffer.from(png.body as Uint8Array).toString("base64"),
            mimeType: "image/png",
          },
        ];
        if (svg) content.push(text(String(svg.body)));
        return { content };
      } catch (error) {
        const failed = toolError(error);
        if (failed) return failed;
        throw error;
      }
    },
  );

  server.registerTool(
    "save_barcode",
    {
      title: "Save a barcode",
      description: `Save a barcode to QRdx, listed under Barcodes in the dashboard to edit and download later. Needs a QRdx API key with full access on this MCP connection (Authorization: Bearer qrdx_…); it saves to the key's workspace. Every plan saves barcodes (${FREE_SAVED_BARCODES.toLocaleString("en-US")} on Free). Takes the format and value generate_barcode takes, an optional title and options (foreground and background as hex, showText, barHeightMm, quietZone, scale, rotation).`,
      inputSchema: saveInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        title: "Save a barcode",
      },
    },
    async (input, ctx: ToolContext) => {
      try {
        const req = ctx.http?.req ?? null;
        const caller = req
          ? await optionalApiKeyCaller(req, "write", "save_barcode")
          : null;
        if (!caller) throw apiKeyRequiredError("save_barcode");
        const saved = await createBarcode(caller.scope, input);
        const slug = await workspaceSlug(caller.scope.organizationId);
        const dashboardUrl = slug
          ? new URL(
              workspaceHref(slug, `/barcodes/${encodeURIComponent(saved.id)}`),
              baseUrl,
            ).toString()
          : null;
        const imageUrl = barcodeImageUrl(
          baseUrl,
          saved.format,
          saved.value,
          saved.options,
        );
        return {
          content: [
            text(
              `Saved "${barcodeLabel(saved)}" to the workspace's Barcodes.${dashboardUrl ? ` Open it: ${dashboardUrl}` : ""}`,
            ),
            text(
              JSON.stringify(
                {
                  id: saved.id,
                  title: saved.title,
                  format: saved.format,
                  value: saved.value,
                  options: saved.options,
                  imageUrl,
                  dashboardUrl,
                },
                null,
                2,
              ),
            ),
          ],
        };
      } catch (error) {
        const failed = toolError(error);
        if (failed) return failed;
        throw error;
      }
    },
  );
}
