import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  buildQrImageUrl,
  getQrStyleCatalog,
  QrDataTooLongError,
  qrOptionsSchema,
  renderQrPng,
  renderQrSvg,
} from "@/lib/qr-render";
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
  "QRdx renders styled, scannable QR codes. Call generate_qr_code with the text or URL to encode; it returns a PNG image and public image URLs you can embed in Markdown or HTML (set include_svg for the SVG markup). For Wi-Fi, contacts, email, SMS or locations, first build the payload with the matching qr_payload_* tool and pass its output as `data`. list_qr_styles lists every pattern, template and limit.";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const text = (value: string) => ({ type: "text" as const, text: value });

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
    "generate_qr_code",
    {
      title: "Generate QR code",
      description:
        "Render a styled QR code. Returns a PNG image and public image URLs (SVG and PNG) for embedding in Markdown or HTML; set include_svg to also get the SVG markup. Logos and gradients are not supported here; use solid hex colors.",
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
