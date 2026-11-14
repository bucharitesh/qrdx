// The QR card: an MCP Apps view (the io.modelcontextprotocol/ui extension,
// SEP-1865, stable 2026-01-26) that apps supporting MCP Apps show under
// design_qr and generate_qr_code. It shows the code, what it encodes, PNG
// and SVG buttons and an editor link.
//
// Clients without MCP Apps see exactly what they saw before: the tools keep
// their content, the link to the card sits in the tool's `_meta`, and the
// card's data rides in the result's `_meta`, which hosts hand to the view
// and keep out of the model's context. Nothing goes in structuredContent,
// which some clients show the model instead of the text.
import type { McpServer } from "@modelcontextprotocol/server";
import { apiBaseUrl } from "@/lib/agents/hosts";
import type { McpDeployment } from "@/lib/mcp-clients";
import { baseUrl } from "@/lib/metadata";
import { contentTypeLabel } from "@/lib/qr-design/content";
import { QR_CARD_HTML } from "./qr-card-html";

export const QR_CARD_URI = "ui://qrdx/qr-card";

/** The MCP Apps HTML resource type (RESOURCE_MIME_TYPE in ext-apps). */
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

/** The result `_meta` key that carries a QrCard (prefixed, as MCP asks). */
export const QR_CARD_META_KEY = "dev.qrdx/qr-card";

/**
 * A tool's `_meta` that links it to the card. `ui/resourceUri` is the
 * deprecated flat form; the ext-apps SDK's registerAppTool still sets it
 * next to `ui.resourceUri` for hosts that only read that one.
 */
export const QR_CARD_TOOL_META = {
  ui: { resourceUri: QR_CARD_URI },
  "ui/resourceUri": QR_CARD_URI,
};

/** What the card shows for one code. */
export interface QrCard {
  /** What the code encodes, for people: "URL · https://…", "WiFi · Cafe Guest" */
  encodes: string;
  /** A few facts: size, error correction, scan score */
  details: string[];
  /**
   * Public image API URLs on the image API's host, or null when the code
   * has none (an uploaded logo, a style too long for a URL, or design_qr,
   * whose content never goes in a URL). The card then shows the result's
   * PNG.
   */
  svg: string | null;
  png: string | null;
  /** Opens the design in the QRdx editor (style only, as design_qr's link) */
  editor: string | null;
  /** File name for saved images, without the extension */
  fileName: string;
}

/** The host the card loads images from: the image API, per lib/agents/hosts. */
export function qrCardImageOrigin(
  origin: string | URL = baseUrl,
  deployment?: McpDeployment,
): string {
  return new URL(apiBaseUrl(origin, deployment)).origin;
}

/** The card resource's `_meta.ui`: the image API host only, and a border. */
export function qrCardResourceMeta(
  origin: string | URL = baseUrl,
  deployment?: McpDeployment,
) {
  return {
    ui: {
      csp: { resourceDomains: [qrCardImageOrigin(origin, deployment)] },
      prefersBorder: true,
    },
  };
}

/**
 * The same image on the image API's public host: `https://api.qrdx.dev/v1/qr`
 * wherever QRdx itself runs, `<origin>/api/v1/qr` on a self-hosted copy.
 */
export function cardImageUrl(
  imageUrl: string,
  origin: string | URL = baseUrl,
  deployment?: McpDeployment,
): string {
  return `${apiBaseUrl(origin, deployment)}/qr${new URL(imageUrl).search}`;
}

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const firstMatch = (value: string, pattern: RegExp) =>
  pattern.exec(value)?.[1]?.trim() ?? "";

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The network name in a WIFI: payload, read field by field (\\; is escaped). */
function wifiSsid(payload: string): string {
  const fields: string[] = [];
  let field = "";
  const body = payload.slice("WIFI:".length);
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === "\\" && index + 1 < body.length) {
      field += char + body[index + 1];
      index++;
    } else if (char === ";") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  const ssid = fields.find((item) => /^S:/i.test(item));
  return ssid ? ssid.slice(2).replace(/\\(.)/g, "$1") : "";
}

/**
 * A raw payload as people read it, in design_qr's "Type · detail" form.
 * Wi-Fi shows the network name, never the password.
 */
export function describePayload(data: string): string {
  const value = data.trim();
  const label = (type: Parameters<typeof contentTypeLabel>[0], detail = "") =>
    detail
      ? `${contentTypeLabel(type)} · ${clip(detail, 120)}`
      : contentTypeLabel(type);
  if (/^https?:\/\//i.test(value)) return label("url", value);
  if (/^WIFI:/i.test(value)) return label("wifi", wifiSsid(value));
  if (/^BEGIN:VCARD/i.test(value)) {
    return label("vcard", firstMatch(value, /^FN[^:]*:(.*)$/im));
  }
  if (/^mailto:/i.test(value)) {
    return label("email", decoded(firstMatch(value, /^mailto:([^?]*)/i)));
  }
  if (/^smsto:/i.test(value)) {
    return label("sms", firstMatch(value, /^smsto:([^:]*)/i));
  }
  if (/^sms:/i.test(value)) {
    return label("sms", decoded(firstMatch(value, /^sms:([^?]*)/i)));
  }
  if (/^tel:/i.test(value))
    return label("phone", firstMatch(value, /^tel:(.*)$/i));
  if (/^geo:/i.test(value)) {
    return label(
      "maps",
      firstMatch(value, /^geo:([^?;]*)/i).replace(",", ", "),
    );
  }
  const firstLine = value.split(/\r?\n/, 1)[0] ?? "";
  return label("text", clip(firstLine, 40));
}

/** Registers the card as a `ui://` resource. design_qr and generate_qr_code link to it. */
export function registerQrCard(server: McpServer) {
  const meta = qrCardResourceMeta();
  server.registerResource(
    "qr_card",
    QR_CARD_URI,
    {
      title: "QR code card",
      description:
        "Shows a QR code from design_qr or generate_qr_code with what it encodes, PNG and SVG files and an editor link, in apps that support MCP Apps.",
      mimeType: MCP_APP_MIME_TYPE,
      _meta: meta,
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: MCP_APP_MIME_TYPE,
          text: QR_CARD_HTML,
          _meta: meta,
        },
      ],
    }),
  );
}
