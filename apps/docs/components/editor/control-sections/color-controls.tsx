"use client";

import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import type { ThemeStyles } from "@/types/theme";

interface ColorControlsProps {
  style: Partial<ThemeStyles>;
  onStyleChange: (style: Partial<ThemeStyles>) => void;
}

export function ColorControls({ style, onStyleChange }: ColorControlsProps) {
  const isLogoQR = style.type === "logo_qr";

  return (
    <ControlSection title="Colors" expanded>
      {isLogoQR ? (
        <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/20">
          <p className="text-amber-900 text-sm dark:text-amber-300">
            <strong>Color customization not available in Logo QR mode.</strong>
          </p>
          <p className="mt-2 text-amber-800 text-xs dark:text-amber-400">
            Logo QR uses fixed black and white dots to ensure optimal contrast
            with the logo background. Only pattern customization is available.
          </p>
        </div>
      ) : (
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
      )}
    </ControlSection>
  );
}
