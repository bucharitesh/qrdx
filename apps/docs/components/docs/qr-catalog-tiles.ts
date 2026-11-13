import { CANONICAL_HOST, CANONICAL_ORIGIN } from "@repo/config";
import type { QRProps } from "qrdx";
import {
  BODY_CATALOG,
  DOT_CATALOG,
  EYE_CATALOG,
  FRAME_CATALOG,
} from "@/lib/pattern-catalog";

// The tiles of the docs style catalogue (components/docs/qr-catalog.tsx):
// every body pattern, eye, eye centre and frame, each on plain square
// shapes. Shared by the server part, which links each tile into the
// playground, and the client part, which draws and decodes them.

/** What every tile encodes; the browser check decodes it back. */
export const CATALOG_VALUE = `${CANONICAL_ORIGIN}/docs/styles`;

const PLAIN = {
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
} as const;

export interface CatalogTile {
  id: string;
  label: string;
  /** The prop and value to copy, e.g. bodyPattern="liquid" */
  code: string;
  category: string;
  note?: string;
  props: QRProps;
}

export type QrCatalogKind = "body" | "eye" | "dot" | "frame";

export function tilesFor(kind: QrCatalogKind): CatalogTile[] {
  switch (kind) {
    case "body":
      return BODY_CATALOG.map((item) => ({
        id: `body-${item.value}`,
        label: item.label,
        code: `bodyPattern="${item.value}"`,
        category: item.category,
        note: item.note,
        props: { value: CATALOG_VALUE, ...PLAIN, bodyPattern: item.value },
      }));
    case "eye":
      return EYE_CATALOG.map((item) => ({
        id: `eye-${item.value}`,
        label: item.label,
        code: `cornerEyePattern="${item.value}"`,
        category: item.category,
        note: item.note,
        props: {
          value: CATALOG_VALUE,
          ...PLAIN,
          cornerEyePattern: item.value,
          cornerEyeDotPattern: item.recommendedDot,
        },
      }));
    case "dot":
      return DOT_CATALOG.map((item) => ({
        id: `dot-${item.value}`,
        label: item.label,
        code: `cornerEyeDotPattern="${item.value}"`,
        category: item.category,
        note: item.note,
        props: {
          value: CATALOG_VALUE,
          ...PLAIN,
          cornerEyeDotPattern: item.value,
        },
      }));
    default:
      return FRAME_CATALOG.map((item) => ({
        id: `frame-${item.value}`,
        label: item.label,
        code: `frame={{ style: "${item.value}" }}`,
        category: item.category,
        props: {
          value: CATALOG_VALUE,
          ...PLAIN,
          frame: {
            style: item.value,
            text: "Scan me",
            ...(item.secondLine && { secondaryText: CANONICAL_HOST }),
          },
        },
      }));
  }
}
