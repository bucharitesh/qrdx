"use client";

import ControlSection from "@/components/editor/control-section";
import { CornerEyeDotPatternSelector } from "@/components/playground/corner-eye-dot-pattern-selector";
import { CornerEyePatternSelector } from "@/components/playground/corner-eye-pattern-selector";
import { PatternSelector } from "@/components/playground/pattern-selector";

export function PatternControls() {
  return (
    <>
      <ControlSection title="Dot Patterns" expanded kbd=",">
        <PatternSelector />
      </ControlSection>

      <ControlSection title="Corner Eye Patterns" kbd=".">
        <CornerEyePatternSelector />
      </ControlSection>

      <ControlSection title="Internal Eye Patterns" kbd="/">
        <CornerEyeDotPatternSelector />
      </ControlSection>
    </>
  );
}
