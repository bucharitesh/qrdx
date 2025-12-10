"use client";

import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import type { ThemeStyles } from "@/types/theme";

interface ColorControlsProps {
  style: Partial<ThemeStyles>;
  onStyleChange: (style: Partial<ThemeStyles>) => void;
}

export function ColorControls({ style, onStyleChange }: ColorControlsProps) {
  return (
    <ControlSection title="Colors" expanded>
      <div className="space-y-3">
        <GradientPicker
          fallbackColor="#000000"
          label="QR Color"
          value={style.fgColor}
          onChange={(value) => onStyleChange({ ...style, fgColor: value })}
        />
        <GradientPicker
          fallbackColor="#ffffff"
          label="Background"
          value={style.bgColor}
          onChange={(value) => onStyleChange({ ...style, bgColor: value })}
        />
        <GradientPicker
          fallbackColor="#000000"
          label="Eye Color"
          value={style.eyeColor}
          onChange={(value) => onStyleChange({ ...style, eyeColor: value })}
        />
        <GradientPicker
          fallbackColor="#000000"
          label="Dot Color"
          value={style.dotColor}
          onChange={(value) => onStyleChange({ ...style, dotColor: value })}
        />
      </div>
    </ControlSection>
  );
}
