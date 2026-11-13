// The Square Border template: its artwork is a frame spec (./specs/square-border.json),
// drawn by the frame engine in the template's own box (./frame-template.tsx).
import type { TemplateDefinition } from "../../types";
import type { FrameSpec } from "../../types/frame-spec";
import { frameTemplate } from "./frame-template";
import squareBorder from "./specs/square-border.json";

export const SquareBorder: TemplateDefinition = frameTemplate({
  id: "SquareBorder",
  name: "Square Border",
  description: "QR code with square decorative border",
  spec: squareBorder as unknown as FrameSpec,
  at: { x: 0, y: 0, scale: 300 / 316 },
});
