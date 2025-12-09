"use client";

import ControlSection from "@/components/editor/control-section";
import { ErrorLevelSelector } from "@/components/playground/error-level-selector";

export function SettingsControls() {
  return (
    <ControlSection title="Error Correction" expanded>
      <ErrorLevelSelector />
    </ControlSection>
  );
}

