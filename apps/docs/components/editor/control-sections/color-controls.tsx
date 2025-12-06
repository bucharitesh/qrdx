"use client";

import { getContrastLevel, getContrastRatio } from "qrdx";
import * as React from "react";
import { ColorPicker } from "@/components/editor/color-picker";
import ControlSection from "@/components/editor/control-section";
import type { QRStyle } from "@/types/qr";

interface ColorControlsProps {
  style: Partial<QRStyle>;
  onStyleChange: (style: Partial<QRStyle>) => void;
}

export function ColorControls({ style, onStyleChange }: ColorControlsProps) {
  // Calculate contrast ratio and level
  const contrastInfo = React.useMemo(() => {
    const fgColor = style.fgColor || "#000000";
    const bgColor = style.bgColor || "#ffffff";
    const ratio = getContrastRatio(fgColor, bgColor);
    const level = getContrastLevel(ratio);
    return {
      ratio: ratio.toFixed(2),
      ...level,
    };
  }, [style.fgColor, style.bgColor]);

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

      {/* Contrast Feedback */}
      <div
        className={`mt-4 flex items-center gap-3 rounded-lg px-3 py-2 ${
          contrastInfo.warning
            ? "border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950"
            : "border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
        }`}
      >
        <div
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            contrastInfo.warning
              ? "bg-orange-100 dark:bg-orange-900"
              : "bg-green-100 dark:bg-green-900"
          }`}
        >
          {contrastInfo.warning ? (
            <span className="font-bold text-orange-600 text-xs dark:text-orange-400">
              !
            </span>
          ) : (
            <span className="font-bold text-green-600 text-xs dark:text-green-400">
              ✓
            </span>
          )}
        </div>
        <span
          className={`text-xs ${
            contrastInfo.warning
              ? "text-orange-800 dark:text-orange-200"
              : "text-green-800 dark:text-green-200"
          }`}
        >
          {contrastInfo.warning
            ? "Hard to scan. Use more contrast colors."
            : "Great! Your QR code is easy to scan."}
        </span>
      </div>
    </ControlSection>
  );
}
