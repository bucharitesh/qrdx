// The Standard Box template: its artwork is a frame spec (./specs/standard-box.json),
// drawn by the frame engine in the template's own box (./frame-template.tsx).
import type { TemplateDefinition } from "../../types";
import type { FrameSpec } from "../../types/frame-spec";
import { frameTemplate } from "./frame-template";
import standardBox from "./specs/standard-box.json";

export const StandardBox: TemplateDefinition = frameTemplate({
  id: "StandardBox",
  name: "Standard Box",
  description: "QR code with standard box",
  spec: standardBox as unknown as FrameSpec,
  at: { x: 46, y: 1, scale: 1 },
});
