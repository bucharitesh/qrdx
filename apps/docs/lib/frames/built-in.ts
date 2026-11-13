// The engine's built-in frames (qrdx BUILT_IN_FRAMES): the classic frames,
// each a small frame spec, safe in the browser. A design names one by its
// style ({ style: "banner-bottom", text, … }); the editor opens it through
// its spec like any other frame.
import { BUILT_IN_FRAMES, getBuiltInFrame } from "qrdx";
import type { FrameSpec, FrameStyle } from "qrdx/types";

/** Every built-in frame style (each opens as an editable spec). */
export const BUILT_IN_SPEC_STYLES: FrameStyle[] = BUILT_IN_FRAMES.map(
  (frame) => frame.style,
);

export const builtInSpec = (style: FrameStyle): FrameSpec | undefined =>
  getBuiltInFrame(style)?.spec;

/** The frame a call-to-action label adds when there is none yet. */
export const DEFAULT_FRAME_STYLE = BUILT_IN_SPEC_STYLES[0] ?? "banner-bottom";
