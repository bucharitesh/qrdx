import type { QRProps } from "qrdx/types";
import { easterEggUrl } from "@/lib/easter-eggs";
import {
  SHOWCASE_PLACEMENTS as AT,
  showcaseProps,
} from "@/lib/landing/showcase-styles";

/**
 * The codes the home feature demos draw, one showcase style each so the
 * cards differ (tests/lib/showcase-styles.test.ts checks every one scans).
 * The studio's patterns, colors and frame are a starting point it edits.
 */
export const HOME_CODES = {
  studio: showcaseProps(AT["home.studio"], {
    value: easterEggUrl("studio"),
    size: 224,
  }),
  // Drawn with a quiet zone, so the live score counts it.
  scanScore: showcaseProps(AT["home.scan-score"], {
    value: easterEggUrl("score"),
    size: 144,
    margin: 2,
  }),
  printSize: showcaseProps(AT["home.print-size"], {
    value: easterEggUrl("print"),
    size: 144,
  }),
  dynamic: showcaseProps(AT["home.dynamic"], {
    value: easterEggUrl("menu"),
    size: 112,
  }),
} satisfies Record<string, QRProps>;
