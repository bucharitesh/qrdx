// The Striked Box template: its artwork is a frame spec (./specs/striked-box.json),
// drawn by the frame engine in the template's own box (./frame-template.tsx).
import type { TemplateDefinition } from "../../types";
import type { FrameSpec } from "../../types/frame-spec";
import { frameTemplate } from "./frame-template";
import strikedBox from "./specs/striked-box.json";

export const StrikedBox: TemplateDefinition = frameTemplate({
  id: "StrikedBox",
  name: "Striked Box",
  description: "QR code with striked box",
  spec: strikedBox as unknown as FrameSpec,
  at: { x: 24, y: 0, scale: 1 },
});
