"use client";

import ControlSection from "@/components/editor/control-section";
import { TemplateSelector } from "@/components/playground/template-selector";

export function FrameControls() {
  return (
    <ControlSection title="Frames" expanded kbd="F">
      <TemplateSelector />
    </ControlSection>
  );
}





