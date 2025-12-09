"use client";

import { ColorPicker } from "@/components/editor/color-picker";
import ControlSection from "@/components/editor/control-section";
import type { ThemeStyles } from "@/types/theme";

interface ColorControlsProps {
  style: Partial<ThemeStyles>;
  onStyleChange: (style: Partial<ThemeStyles>) => void;
}

export function ColorControls({ style, onStyleChange }: ColorControlsProps) {
  return (
    <ControlSection title="Colors" expanded>
      <div className="space-y-3">
        <ColorPicker
          color={style.fgColor || "#000000"}
          label="QR Color"
          name="fgColor"
          onChange={(value) =>
            onStyleChange({ ...style, fgColor: value as string })
          }
        />
        <ColorPicker
          color={style.bgColor || "#ffffff"}
          label="Background"
          name="bgColor"
          onChange={(value) =>
            onStyleChange({ ...style, bgColor: value as string })
          }
        />
        <ColorPicker
          color={style.eyeColor || style.fgColor || "#000000"}
          label="Eye Color"
          name="eyeColor"
          onChange={(value) =>
            onStyleChange({ ...style, eyeColor: value as string })
          }
        />
        <ColorPicker
          color={style.dotColor || style.fgColor || "#000000"}
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

