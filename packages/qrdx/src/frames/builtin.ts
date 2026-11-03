// Built-in frames written as frame specs: the proof that the spec format
// covers what the engine's own frames draw (tests/frame-spec-parity.test.ts
// renders each against its built-in twin), and starting points for editors.
import type { FrameStyle } from "../../types/frame";
import type { FrameSpec } from "../../types/frame-spec";
import bannerBottom from "./builtin/banner-bottom.json";
import circle from "./builtin/circle.json";
import roundedBorder from "./builtin/rounded-border.json";
import ticket from "./builtin/ticket.json";

/**
 * Specs that draw the same artwork as these built-in styles (with a label
 * set; the built-ins shrink when the label is empty, a spec doesn't).
 */
export const BUILT_IN_FRAME_SPECS: Partial<Record<FrameStyle, FrameSpec>> = {
  "banner-bottom": bannerBottom as unknown as FrameSpec,
  "rounded-border": roundedBorder as unknown as FrameSpec,
  circle: circle as unknown as FrameSpec,
  ticket: ticket as unknown as FrameSpec,
};
