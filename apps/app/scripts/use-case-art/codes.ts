// The real QR code in each home-page use-case illustration: what it encodes
// and which showcase style (lib/landing/showcase-styles.ts) draws it.
// generate.ts bakes these into
// public/images/use-cases/<id>-{light,dark}.svg, and
// tests/use-case-art.test.ts checks that every baked code decodes to `value`.
//
// Links go to the qrdx.dev page each card links to. The payment card links to
// the UPI generator instead of a UPI ID, so no scan can pay a real person.

import type { ShowcaseStyleName } from "@/lib/landing/showcase-styles";
import { encodeQRContent } from "@/utils/qr-content-encoder";

export const USE_CASE_ART_IDS = [
  "cafe-table-tent",
  "business-card",
  "hotel-wifi-sign",
  "market-stall-upi",
  "product-packaging",
  "event-check-in",
  "retail-shelf-tag",
  "bus-stop-poster",
] as const;

export type UseCaseArtId = (typeof USE_CASE_ART_IDS)[number];

export interface UseCaseCode {
  value: string;
  /** A look from the marketing style registry, different on every card. */
  style: ShowcaseStyleName;
}

export const USE_CASE_CODES: Record<UseCaseArtId, UseCaseCode> = {
  "cafe-table-tent": {
    value: "https://qrdx.dev/qr-code-generator/url",
    style: "menu",
  },
  "business-card": {
    value: encodeQRContent({
      type: "vcard",
      firstName: "Asha",
      lastName: "Rao",
      email: "asha@example.com",
    }),
    style: "signature",
  },
  "hotel-wifi-sign": {
    value: encodeQRContent({
      type: "wifi",
      ssid: "Lobby Guest",
      password: "welcome-in",
      encryption: "WPA",
    }),
    style: "dots",
  },
  "market-stall-upi": {
    value: "https://qrdx.dev/qr-code-generator/upi",
    style: "classy",
  },
  "product-packaging": {
    value: "https://qrdx.dev/tools/bulk",
    style: "lines",
  },
  "event-check-in": {
    value: "https://qrdx.dev/qr-code-generator/attendance",
    style: "ticket",
  },
  "retail-shelf-tag": {
    value: "https://qrdx.dev/qr-code-generator/amazon",
    style: "facet",
  },
  "bus-stop-poster": {
    value: "https://qrdx.dev/tools/print-size",
    style: "fluid",
  },
};
