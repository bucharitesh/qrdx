import type { McpServer } from "@modelcontextprotocol/server";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import {
  buildQrImageUrl,
  getQrStyleCatalog,
  QrDataTooLongError,
  qrOptionsSchema,
  renderQrPng,
  renderQrSvg,
} from "@/lib/qr-render";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { designOptions, designQr, designQrInputSchema } from "./design";
import {
  buildEmailPayload,
  buildGeoPayload,
  buildSmsPayload,
  buildVcardPayload,
  buildWifiPayload,
  emailPayloadSchema,
  geoPayloadSchema,
  smsPayloadSchema,
  vcardPayloadSchema,
  wifiPayloadSchema,
} from "./payloads";

export const MCP_SERVER_INFO = { name: "qrdx", version: "1.0.0" };

export const MCP_INSTRUCTIONS =
  "QRdx renders styled, scannable QR codes. To design one (any content type: links, Wi-Fi, contacts, payments and more, with colours, gradients, shapes, frames and borders), call list_options for the accepted values, then design_qr with the content and the style you chose: it validates both, checks the scan score and repairs the style until it is Great, and returns the style JSON, the score, an SVG and a PNG. For a quick code with public image URLs you can embed in Markdown or HTML, call generate_qr_code (set include_svg for the SVG markup); for Wi-Fi, contacts, email, SMS or locations, first build the payload with the matching qr_payload_* tool and pass its output as `data`. list_qr_styles lists generate_qr_code's patterns, templates and limits.";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const text = (value: string) => ({ type: "text" as const, text: value });

// design_qr renders and decodes the code up to six times, so it has its own
// tighter per-IP limit on top of the endpoint's.
const designLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
});

/*
 * Saving a design to a QRdx account (save_template) is not offered here yet:
 * it needs to know whose account. The plan, once workspace API keys
 * (`qrdx_…`, sent as `Authorization: Bearer`) land:
 * 1. Wrap the handler in route.ts with mcp-handler's withMcpAuth, verifying
 *    the key (lib/api-keys) and returning AuthInfo with the key's user and
 *    workspace and its scopes; keys stay optional so these tools stay keyless.
 * 2. Register save_template, which reads ctx.http.authInfo, refuses without
 *    a key that has a themes write scope, and saves through the same
 *    TemplateStore as the chat (lib/ai/agent/templates.ts), so the plan's
 *    saved-theme limit and its message apply; input { name, style } with the
 *    style from design_qr. Annotate it destructiveHint false, readOnlyHint
 *    false, and rate limit it per key.
 * 3. List it in the docs and the server card only then.
 */

const generateInput = qrOptionsSchema.extend({
  include_svg: z
    .boolean()
    .default(false)
    .describe(
      "Also return the SVG markup as text, e.g. to save an .svg file. It is often 50-150 KB, so only request it when needed.",
    ),
});

export function registerQrTools(server: McpServer) {
  server.registerTool(
    "design_qr",
    {
      title: "Design a QR code",
      description:
        "Design a QR code for any content type (link, Wi-Fi, contact, email, SMS, WhatsApp, payments, social profiles and more) with the style you choose: colours and gradients, dot, eye and eye centre shapes, a call-to-action frame with its text, a border, margin and error correction. Validates the content like the QRdx editor, checks the scan score with the editor's scan check and repairs the style until it is Great (at most 3 repairs, then a classic black-on-white code). Returns the score, what was changed and why, the validated style JSON, a PNG and the SVG. Call list_options first for the accepted values. No logos.",
      inputSchema: designQrInputSchema,
      annotations: { ...readOnly, title: "Design a QR code" },
    },
    async (input, ctx) => {
      const ip = ctx.http?.req ? getClientIp(ctx.http.req) : "unknown";
      try {
        await enforceRateLimits([
          { limiter: designLimiter, key: `mcp:design:ip:${ip}` },
        ]);
      } catch (error) {
        if (error instanceof HttpError && error.status === 429) {
          return {
            isError: true,
            content: [
              text(
                "Too many designs from this address. Wait a minute and try again.",
              ),
            ],
          };
        }
        throw error;
      }
      const result = await designQr(input);
      if (!result.ok) {
        return { isError: true, content: [text(result.message)] };
      }
      const content = [
        text(result.summary),
        text(JSON.stringify(result.design, null, 2)),
        {
          type: "image" as const,
          data: Buffer.from(result.png).toString("base64"),
          mimeType: "image/png",
        },
      ];
      if (result.svg) content.push(text(result.svg));
      return { content };
    },
  );

  server.registerTool(
    "list_options",
    {
      title: "List design options",
      description:
        "List every value design_qr accepts: content types with their fields, colours and gradients, body patterns, eye and eye centre shapes, frame styles and their text limit, border templates, error correction levels, margin and size limits, and how the scan score works.",
      annotations: { ...readOnly, title: "List design options" },
    },
    () => ({
      content: [text(JSON.stringify(designOptions(), null, 2))],
    }),
  );

  server.registerTool(
    "generate_qr_code",
    {
      title: "Generate QR code",
      description:
        "Render a styled QR code. Returns a PNG image and public image URLs (SVG and PNG for embedding in Markdown or HTML, plus a vector EPS for print); set include_svg to also get the SVG markup. Logos and gradients are not supported here; use solid hex colors.",
      inputSchema: generateInput,
      annotations: { ...readOnly, title: "Generate QR code" },
    },
    async ({ include_svg, ...options }) => {
      let svg: string | undefined;
      let png: ArrayBuffer;
      try {
        if (include_svg) svg = renderQrSvg(options);
        png = await renderQrPng(options);
      } catch (error) {
        if (error instanceof QrDataTooLongError) {
          return { isError: true, content: [text(error.message)] };
        }
        throw error;
      }

      const url = buildQrImageUrl(options);
      const content = [
        text(
          [
            `QR code, ${options.size}x${options.size}px, error correction ${options.level}.`,
            `SVG URL: ${url}`,
            `PNG URL: ${buildQrImageUrl(options, "png")}`,
            `EPS URL (vector, for print; ${options.size} pt wide): ${buildQrImageUrl(options, "eps")}`,
            `Markdown: ![QR code](${url})`,
          ].join("\n"),
        ),
        {
          type: "image" as const,
          data: Buffer.from(png).toString("base64"),
          mimeType: "image/png",
        },
      ];
      if (svg) content.push(text(svg));
      return { content };
    },
  );

  server.registerTool(
    "list_qr_styles",
    {
      title: "List QR styles",
      description:
        "List the body patterns, corner eye shapes, eye dot shapes, frame templates, error correction levels, defaults and limits accepted by generate_qr_code and the image API.",
      annotations: { ...readOnly, title: "List QR styles" },
    },
    () => ({
      content: [text(JSON.stringify(getQrStyleCatalog(), null, 2))],
    }),
  );

  server.registerTool(
    "qr_payload_wifi",
    {
      title: "Wi-Fi QR payload",
      description:
        "Build a Wi-Fi network payload (WIFI:T:WPA;S:...;P:...;;) that phones join when scanned. Pass the result as `data` to generate_qr_code.",
      inputSchema: wifiPayloadSchema,
      annotations: { ...readOnly, title: "Wi-Fi QR payload" },
    },
    (input) => ({ content: [text(buildWifiPayload(input))] }),
  );

  server.registerTool(
    "qr_payload_vcard",
    {
      title: "Contact (vCard) QR payload",
      description:
        "Build a vCard 3.0 contact payload (RFC 2426) that phones offer to save as a contact. Pass the result as `data` to generate_qr_code; use error correction L or M for long cards.",
      inputSchema: vcardPayloadSchema,
      annotations: { ...readOnly, title: "Contact (vCard) QR payload" },
    },
    (input) => ({ content: [text(buildVcardPayload(input))] }),
  );

  server.registerTool(
    "qr_payload_email",
    {
      title: "Email QR payload",
      description:
        "Build a mailto: payload (RFC 6068) that opens a prefilled email. Pass the result as `data` to generate_qr_code.",
      inputSchema: emailPayloadSchema,
      annotations: { ...readOnly, title: "Email QR payload" },
    },
    (input) => ({ content: [text(buildEmailPayload(input))] }),
  );

  server.registerTool(
    "qr_payload_sms",
    {
      title: "SMS QR payload",
      description:
        "Build an SMS payload (sms: URI, RFC 5724, or SMSTO:) that opens a prefilled text message. Pass the result as `data` to generate_qr_code.",
      inputSchema: smsPayloadSchema,
      annotations: { ...readOnly, title: "SMS QR payload" },
    },
    (input) => ({ content: [text(buildSmsPayload(input))] }),
  );

  server.registerTool(
    "qr_payload_geo",
    {
      title: "Location QR payload",
      description:
        "Build a geo: location payload (RFC 5870) that opens the point in a maps app. Pass the result as `data` to generate_qr_code.",
      inputSchema: geoPayloadSchema,
      annotations: { ...readOnly, title: "Location QR payload" },
    },
    (input) => ({ content: [text(buildGeoPayload(input))] }),
  );
}
