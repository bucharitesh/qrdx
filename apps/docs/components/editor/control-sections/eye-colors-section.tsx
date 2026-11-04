"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { RefreshLeftSquare } from "iconsax-reactjs";
import {
  type ColorConfig,
  EYE_POSITIONS,
  type EyeColorOverride,
  type EyePosition,
  getColorString,
} from "qrdx/types";
import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import type { QRStyle } from "@/types/theme";

export const EYE_POSITION_NAMES: Record<EyePosition, string> = {
  topLeft: "Top left",
  topRight: "Top right",
  bottomLeft: "Bottom left",
};

/** True when at least one eye has its own color. */
export function hasEyeColors(style: Partial<QRStyle>): boolean {
  return EYE_POSITIONS.some(
    (position) =>
      style.eyeColors?.[position]?.outer || style.eyeColors?.[position]?.inner,
  );
}

interface EyeColorsSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (eyeColors: QRStyle["eyeColors"]) => void;
}

/**
 * Per-eye colors: each corner eye's frame and center can differ from the
 * Eyes and Dots colors. An eye without its own color keeps those.
 */
export function EyeColorsSection({ style, onChange }: EyeColorsSectionProps) {
  const custom = hasEyeColors(style);

  const setEye = (
    position: EyePosition,
    part: keyof EyeColorOverride,
    color: ColorConfig,
  ) => {
    onChange({
      ...style.eyeColors,
      [position]: { ...style.eyeColors?.[position], [part]: color },
    });
  };

  const outer = (position: EyePosition) =>
    style.eyeColors?.[position]?.outer ?? style.eyeColor ?? style.fgColor;
  const inner = (position: EyePosition) =>
    style.eyeColors?.[position]?.inner ??
    style.dotColor ??
    style.eyeColor ??
    style.fgColor;

  return (
    <ControlSection
      id="section-eye-colors"
      summary={
        custom ? (
          <span className="flex -space-x-1">
            {EYE_POSITIONS.map((position) => {
              const color = outer(position);
              return (
                <span
                  className="ring-background size-3.5 rounded-full border ring-2"
                  key={position}
                  style={{
                    background: color ? getColorString(color) : undefined,
                  }}
                />
              );
            })}
          </span>
        ) : (
          "Same for all"
        )
      }
      title="Eye colors"
    >
      <p className="text-muted-foreground text-xs text-pretty">
        Give each corner eye its own frame and center color. Eyes you leave
        alone use the Eyes and Dots colors.
      </p>
      {EYE_POSITIONS.map((position) => (
        <fieldset className="space-y-2" key={position}>
          <legend className="text-muted-foreground mb-2 text-xs font-medium">
            {EYE_POSITION_NAMES[position]}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <GradientPicker
              label="Frame"
              name={`eyeColors.${position}.outer`}
              onChange={(color) => setEye(position, "outer", color)}
              value={outer(position)}
            />
            <GradientPicker
              label="Center"
              name={`eyeColors.${position}.inner`}
              onChange={(color) => setEye(position, "inner", color)}
              value={inner(position)}
            />
          </div>
        </fieldset>
      ))}
      {custom && (
        <Button
          onClick={() => onChange(undefined)}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshLeftSquare />
          Use the same colors for all eyes
        </Button>
      )}
    </ControlSection>
  );
}
