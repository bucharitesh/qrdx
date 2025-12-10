"use client";

import { ColorInput } from "@repo/design-system/components/color-picker";
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
        <ColorInput
          value={style.bgColor || "#ffffff"}
          label="Background"
          name="bgColor"
          onChange={(value) =>
            onStyleChange({ ...style, bgColor: value as string })
          }
        />
        <ColorInput
          value={style.eyeColor || "#000000"}
          label="Eye Color"
          name="eyeColor"
          onChange={(value) =>
            onStyleChange({ ...style, eyeColor: value as string })
          }
        />
        <ColorInput
          value={style.dotColor || "#000000"}
          label="Dot Color"
          name="dotColor"
          onChange={(value) =>
            onStyleChange({ ...style, dotColor: value as string })
          }
        />
      </div>
    </ControlSection>
  );
}
