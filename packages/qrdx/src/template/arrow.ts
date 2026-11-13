// The Arrow template: its artwork is a frame spec (./specs/arrow.json),
// drawn by the frame engine in the template's own box (./frame-template.tsx).
import type { TemplateDefinition } from "../../types";
import type { FrameSpec } from "../../types/frame-spec";
import { frameTemplate } from "./frame-template";
import arrow from "./specs/arrow.json";

export const Arrow: TemplateDefinition = frameTemplate({
  id: "Arrow",
  name: "Arrow",
  description: "QR code with arrow",
  spec: arrow as unknown as FrameSpec,
  at: { x: 47, y: 95, scale: 1 },
});
