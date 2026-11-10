// The n8n nodes (plugins/n8n) can't import the app, so they carry copies of
// the API's option lists and its webhook signature check. These tests hold
// the copies to the OpenAPI document (kept fresh by tests/api/openapi.test.ts)
// and to the app's own event list and signer.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { signatureHeader } from "@/lib/events/signature";
import { PING_EVENT, WEBHOOK_EVENTS } from "@/lib/events/types";
import { LOGO_ICON_IDS } from "@/lib/qr-design/style";
import * as n8n from "../../../../plugins/n8n/nodes/Qrdx/constants";
import { verifySignature } from "../../../../plugins/n8n/nodes/Qrdx/webhook";

interface Parameter {
  name: string;
  schema: {
    enum?: string[];
    minimum?: number;
    maximum?: number;
    maxLength?: number;
    pattern?: string;
    default?: unknown;
  };
}

const openapi = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../public/openapi.json"), "utf8"),
) as {
  servers: { url: string }[];
  paths: Record<string, { get?: { parameters?: Parameter[] } }>;
};

function parameter(path: string, name: string): Parameter["schema"] {
  const found = openapi.paths[path]?.get?.parameters?.find(
    (p) => p.name === name,
  );
  if (!found) throw new Error(`No ${name} parameter on GET ${path}`);
  return found.schema;
}

const sorted = (values: readonly string[] | undefined) =>
  [...(values ?? [])].sort();

describe("n8n node: GET /qr options", () => {
  it.each([
    ["format", n8n.QR_IMAGE_FORMATS],
    ["body", n8n.BODY_SHAPES],
    ["eye", n8n.EYE_SHAPES],
    ["dot", n8n.EYE_DOT_SHAPES],
    ["level", n8n.ERROR_CORRECTION_LEVELS],
    ["frame", n8n.FRAMES],
  ] as const)("%s offers exactly the API's values", (name, values) => {
    expect(sorted(values)).toEqual(sorted(parameter("/qr", name).enum));
  });

  // The API's logoIcon also takes any Simple Icons brand slug (a pattern,
  // not an enum); the node offers the quick icons, every one of which the
  // API accepts.
  it("offers the API's quick logo icons", () => {
    expect(sorted(n8n.LOGO_ICONS)).toEqual(sorted(LOGO_ICON_IDS));
    const pattern = new RegExp(parameter("/qr", "logoIcon").pattern ?? "^$");
    for (const icon of n8n.LOGO_ICONS) expect(icon).toMatch(pattern);
  });

  it("uses the API's limits and defaults", () => {
    expect(parameter("/qr", "size")).toMatchObject({
      minimum: n8n.QR_SIZE.min,
      maximum: n8n.QR_SIZE.max,
      default: n8n.QR_SIZE.default,
    });
    expect(parameter("/qr", "margin")).toMatchObject({
      minimum: n8n.QR_MARGIN.min,
      maximum: n8n.QR_MARGIN.max,
      default: n8n.QR_MARGIN.default,
    });
    expect(parameter("/qr", "frameText").maxLength).toBe(
      n8n.FRAME_TEXT_MAX_LENGTH,
    );
    expect(parameter("/qr", "data").maxLength).toBe(n8n.DATA_MAX_LENGTH);
  });
});

describe("n8n node: codes, scans and hooks", () => {
  it("pages codes and scans within the API's limits", () => {
    expect(sorted(parameter("/codes", "status").enum)).toEqual(
      sorted(n8n.CODE_STATUSES),
    );
    expect(parameter("/codes", "limit").maximum).toBe(n8n.CODES_PAGE_SIZE);
    expect(sorted(parameter("/codes/{id}/scans", "range").enum)).toEqual(
      sorted(n8n.SCAN_RANGES),
    );
    expect(parameter("/codes/{id}/scans", "limit").maximum).toBe(
      n8n.SCANS_PAGE_SIZE,
    );
  });

  it("offers every webhook event, and only those", () => {
    expect(sorted(n8n.WEBHOOK_EVENTS)).toEqual(sorted(WEBHOOK_EVENTS));
    expect(n8n.PING_EVENT).toBe(PING_EVENT);
  });

  it("defaults to the public API host", () => {
    expect(n8n.DEFAULT_BASE_URL).toBe(openapi.servers[0]?.url);
  });
});

describe("n8n node: webhook signatures", () => {
  const secret = "whsec_n8n_node_test_secret";
  const body = JSON.stringify({
    id: "evt_1",
    type: "form.submitted",
    created_at: "2026-11-10T09:30:00.000Z",
    data: { fields: [{ name: "note", label: "Note", value: "Grüße ✓" }] },
  });

  it("accepts what QRdx's deliveries send", () => {
    const now = new Date("2026-11-10T09:30:05.000Z");
    const { header } = signatureHeader(secret, body, now);
    const seconds = now.getTime() / 1000;
    expect(verifySignature(secret, header, body, seconds)).toBe(true);
    expect(verifySignature(secret, header, Buffer.from(body), seconds)).toBe(
      true,
    );
    expect(verifySignature(secret, header, `${body}\n`, seconds)).toBe(false);
    expect(verifySignature(secret, header, body, seconds + 301)).toBe(false);
  });
});
