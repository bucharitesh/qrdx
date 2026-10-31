import type { QRProps } from "../../types";
import { DEFAULT_BGCOLOR, DEFAULT_SIZE } from "../constants";
import { withQRSize } from "../download";
import { getFrameLayout, isFrameActive } from "../frame";
import { getQRAsSVGDataUri } from "../index";
import { getSolidColor } from "./color";

// Shared by the PDF (print.ts) and EPS (eps.ts) exporters; not public API.

/** Logical render size; print output is scaled from this. */
export const PRINT_RENDER_SIZE = 1000;

/** SVG markup of the artwork at the logical print render size (1000 units). */
export async function renderPrintSVG(props: QRProps): Promise<string> {
  const dataUri = await getQRAsSVGDataUri(
    withQRSize(
      { ...props, size: props.size ?? DEFAULT_SIZE },
      PRINT_RENDER_SIZE
    )
  );
  return decodeURIComponent(dataUri.replace("data:image/svg+xml,", ""));
}

/** Color the bleed area is filled with, if any. */
export function getPrintBleedColor(props: QRProps): string | null {
  if (isFrameActive(props.frame)) {
    const frame = getFrameLayout(PRINT_RENDER_SIZE, props.frame);
    return frame.squareEdges ? frame.color : null;
  }
  return getSolidColor(props.bgColor, DEFAULT_BGCOLOR);
}
