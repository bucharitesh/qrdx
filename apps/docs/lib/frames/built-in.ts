// The engine's built-in frame styles that can be opened as an editable spec
// (qrdx BUILT_IN_FRAME_SPECS: a handful of small specs, safe in the browser).
import { BUILT_IN_FRAME_SPECS } from "qrdx";
import type { FrameSpec, FrameStyle } from "qrdx/types";

/** Built-in frame styles that can be opened as an editable spec. */
export const BUILT_IN_SPEC_STYLES = Object.keys(
  BUILT_IN_FRAME_SPECS,
) as FrameStyle[];

export const builtInSpec = (style: FrameStyle): FrameSpec | undefined =>
  BUILT_IN_FRAME_SPECS[style];
