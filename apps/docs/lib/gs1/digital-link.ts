import { gs1CheckDigit } from "@/lib/barcode/formats";

// GS1 Digital Link for product pages: GTIN checks and the URI path
// `/01/<GTIN>[/22/<variant>][/10/<batch or lot>][/21/<serial>]` that a
// workspace's custom domain resolves to the product's hosted page
// (app/gs1/[...path]/route.ts, routed by proxy.ts). Pure: no database, safe
// in the editor and in proxy.ts.
//
// Only custom domains resolve these paths. On QRdx's shared host a GTIN
// namespace would let anyone claim another brand's GTIN, so product pages
// there use their normal short link.

/** GTIN-8, GTIN-12 (UPC-A), GTIN-13 (EAN-13) and GTIN-14. */
export const GTIN_LENGTHS: readonly number[] = [8, 12, 13, 14];

/** Batch/lot, serial and consumer product variant: up to 20 characters. */
const QUALIFIER_MAX = 20;

/**
 * GS1 AI encodable character set 82 (what a batch or serial may hold):
 * digits, letters and ! " % & ' ( ) * + , - . / : ; < = > ? _
 */
const CSET_82 = /^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]+$/;

/** A path that is meant as a GS1 Digital Link (GTIN primary key). */
export const GS1_PATH = /^\/01\/[^/]+(?:\/[^/]*)*$/;

/** Digits only: spaces and hyphens people type between groups dropped. */
export const compactGtin = (input: string): string =>
  input.replace(/[\s-]/g, "");

/**
 * Why `input` isn't a valid GTIN, or null when it is. Empty input is not a
 * GTIN either; callers that allow "none" check for it first.
 */
export function gtinProblem(input: string): string | null {
  const digits = compactGtin(input);
  if (!digits) return "Enter a GTIN";
  if (!/^\d+$/.test(digits)) return "A GTIN has digits only";
  if (!GTIN_LENGTHS.includes(digits.length)) {
    return `A GTIN has 8, 12, 13 or 14 digits; this has ${digits.length}`;
  }
  const expected = gs1CheckDigit(digits.slice(0, -1));
  const given = Number(digits.at(-1));
  if (expected !== given) {
    return `The check digit should be ${expected}, not ${given}. Check the number on the barcode`;
  }
  return null;
}

/** The 14-digit form a Digital Link uses, or null for an invalid GTIN. */
export function normalizeGtin(input: string): string | null {
  if (gtinProblem(input)) return null;
  return compactGtin(input).padStart(14, "0");
}

export interface DigitalLink {
  /** Always 14 digits */
  gtin: string;
  /** AI 22, consumer product variant */
  variant?: string;
  /** AI 10, batch or lot number */
  lot?: string;
  /** AI 21, serial number */
  serial?: string;
}

export type DigitalLinkParse =
  | { ok: true; link: DigitalLink }
  | {
      ok: false;
      reason: "gtin" | "check-digit" | "qualifier";
      message: string;
    };

/** The qualifiers a GTIN may carry, in the order the standard requires. */
const QUALIFIERS = [
  ["22", "variant"],
  ["10", "lot"],
  ["21", "serial"],
] as const;

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Parses a Digital Link path. Returns null when the path isn't one
 * (`/01/...`), and a reason when it is but can't be used: a malformed GTIN,
 * a wrong check digit, or qualifiers that are unknown, out of order, empty
 * or too long. A trailing slash is allowed; the query string is ignored.
 */
export function parseDigitalLinkPath(
  pathname: string,
): DigitalLinkParse | null {
  if (!GS1_PATH.test(pathname)) return null;
  const segments = pathname.replace(/\/+$/, "").split("/").slice(1);
  const [, rawGtin = "", ...rest] = segments;
  const gtinText = decode(rawGtin) ?? "";
  if (!/^\d+$/.test(gtinText) || !GTIN_LENGTHS.includes(gtinText.length)) {
    return {
      ok: false,
      reason: "gtin",
      message: "This link doesn't contain a valid GTIN.",
    };
  }
  const problem = gtinProblem(gtinText);
  if (problem) {
    return {
      ok: false,
      reason: "check-digit",
      message: "The GTIN in this link has a wrong check digit.",
    };
  }

  const link: DigitalLink = { gtin: gtinText.padStart(14, "0") };
  const badQualifier = {
    ok: false,
    reason: "qualifier",
    message: "This link has a batch, serial or variant part that isn't valid.",
  } as const;
  if (rest.length % 2 !== 0) return badQualifier;
  let next = 0;
  for (let i = 0; i < rest.length; i += 2) {
    const ai = rest[i];
    // Unknown (-1) or out of order.
    const index = QUALIFIERS.findIndex(([code]) => code === ai);
    if (index < next) return badQualifier;
    const value = decode(rest[i + 1] ?? "");
    if (!value || value.length > QUALIFIER_MAX || !CSET_82.test(value)) {
      return badQualifier;
    }
    const [, key] = QUALIFIERS[index] as (typeof QUALIFIERS)[number];
    link[key] = value;
    next = index + 1;
  }
  return { ok: true, link };
}

/** `https://<hostname>/01/<gtin>[/10/<lot>][/21/<serial>]` */
export function digitalLinkUri(
  hostname: string,
  gtin: string,
  qualifiers: Omit<DigitalLink, "gtin"> = {},
): string {
  const normalized = normalizeGtin(gtin);
  if (!normalized) throw new Error(`Invalid GTIN "${gtin}"`);
  let path = `/01/${normalized}`;
  for (const [ai, key] of QUALIFIERS) {
    const value = qualifiers[key];
    if (value) path += `/${ai}/${encodeURIComponent(value)}`;
  }
  return `https://${hostname}${path}`;
}

/** The block type whose `gtin` prop a product page resolves by. */
export const PRODUCT_BLOCK_TYPE = "product";

/**
 * A page's GTIN (14 digits): the first visible product block with a valid
 * one, or null. Stored on landing_page.gtin when the page is published.
 */
export function pageGtin(content: {
  blocks: ReadonlyArray<{ type: string; hidden?: boolean; props: unknown }>;
}): string | null {
  for (const block of content.blocks) {
    if (block.type !== PRODUCT_BLOCK_TYPE || block.hidden) continue;
    const gtin = (block.props as { gtin?: unknown } | null)?.gtin;
    const normalized = typeof gtin === "string" ? normalizeGtin(gtin) : null;
    if (normalized) return normalized;
  }
  return null;
}
