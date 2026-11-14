// The Halloween template: its artwork is a frame spec (./specs/halloween.json),
// drawn by the frame engine in the template's own box (./frame-template.tsx).
import type { TemplateDefinition } from "../../types";
import type { FrameSpec } from "../../types/frame-spec";
import { frameTemplate } from "./frame-template";
import halloween from "./specs/halloween.json";

export const Halloween: TemplateDefinition = frameTemplate({
  id: "Halloween",
  name: "Halloween",
  description: "QR code with Halloween theme",
  spec: halloween as unknown as FrameSpec,
  at: { x: 38, y: 10, scale: 1 },
});
