"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { RefreshLeftSquare } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type ColorConfig,
  EYE_POSITIONS,
  type EyeColorOverride,
  type EyePosition,
  getColorString,
} from "qrdx/types";
import ControlSection from "@/components/editor/control-section";
import {
  GradientPicker,
  QR_IMAGE_KINDS,
} from "@/components/editor/gradient-picker";
import type { QRStyle } from "@/types/theme";
import {
  eyeInnerColor,
  eyeOuterColor,
  hasEyeColors,
  withEyeColor,
} from "./eye-colors";

interface EyeColorsSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (eyeColors: QRStyle["eyeColors"]) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/**
 * Per-eye colors: each corner eye's frame and center can differ from the
 * Eyes and Dots colors. An eye without its own color keeps those.
 */
export function EyeColorsSection({
  style,
  onChange,
  expanded,
}: EyeColorsSectionProps) {
  const t = useTranslations("editor.controlSections.eyeColorsSection");
  const custom = hasEyeColors(style);

  const setEye = (
    position: EyePosition,
    part: keyof EyeColorOverride,
    color: ColorConfig,
  ) => {
    onChange(withEyeColor(style.eyeColors, position, part, color));
  };

  const outer = (position: EyePosition) => eyeOuterColor(style, position);
  const inner = (position: EyePosition) => eyeInnerColor(style, position);

  return (
    <ControlSection
      expanded={expanded}
      section="eye-colors"
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
          t("sameForAll")
        )
      }
      title={t("eyeColors")}
    >
      <p className="text-muted-foreground text-xs text-pretty">
        {t("giveEachCornerEyeIts")}
      </p>
      {EYE_POSITIONS.map((position) => (
        <fieldset className="space-y-2" key={position}>
          <legend className="text-muted-foreground mb-2 text-xs font-medium">
            {t(`positions.${position}`)}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <GradientPicker
              kinds={QR_IMAGE_KINDS}
              label={t("frame")}
              name={`eyeColors.${position}.outer`}
              onChange={(color) => setEye(position, "outer", color)}
              value={outer(position)}
            />
            <GradientPicker
              kinds={QR_IMAGE_KINDS}
              label={t("center")}
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
          {t("useTheSameColorsFor")}
        </Button>
      )}
    </ControlSection>
  );
}
