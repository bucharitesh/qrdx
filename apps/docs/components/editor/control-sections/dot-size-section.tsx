"use client";

import { Slider } from "@repo/design-system/components/ui/slider";
import { useTranslations } from "next-intl";
import { MODULE_SCALE_FLOOR } from "qrdx";
import ControlSection from "@/components/editor/control-section";
import type { QRStyle } from "@/types/theme";
import { patternName } from "./pattern-controls";

const STEP = 5;

interface DotSizeSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (moduleScale: number | undefined) => void;
  /** Open it (a link asked for this section) */
  expanded?: boolean;
}

/**
 * Size of each data dot (moduleScale). Every dot shape stops at the
 * smallest size it still scans at, so the range depends on the shape.
 */
export function DotSizeControl({
  style,
  onChange,
}: Omit<DotSizeSectionProps, "expanded">) {
  const t = useTranslations("editor.controlSections.dotSizeSection");
  const { pattern, floor, value, fixed } = dotSize(style);
  return (
    <>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("sizeOfEachDot")}</span>
          <span className="tabular-nums">{value}%</span>
        </div>
        <Slider
          aria-label={t("dotSize")}
          disabled={fixed}
          max={100}
          min={fixed ? 99 : floor}
          onValueChange={([next]) => {
            const scale = (next ?? 100) / 100;
            onChange(scale >= 1 ? undefined : scale);
          }}
          step={fixed ? 1 : Math.min(STEP, 100 - floor)}
          value={[value]}
        />
      </div>
      <p className="text-muted-foreground text-xs text-pretty">
        {fixed
          ? t("valueDotsKeepTheirFull", { value: patternName(pattern) })
          : t("smallerDotsGiveALighter", {
              value: patternName(pattern),
              floor,
            })}
      </p>
    </>
  );
}

/** The dot size shown (percent) and the smallest the shape allows. */
export function dotSize(style: Partial<QRStyle>) {
  const pattern = style.bodyPattern ?? "circle";
  const floor = Math.round((MODULE_SCALE_FLOOR[pattern] ?? 1) * 100);
  const value = Math.max(floor, Math.round((style.moduleScale ?? 1) * 100));
  return { pattern, floor, value, fixed: floor >= 100 };
}

export function DotSizeSection({
  style,
  onChange,
  expanded,
}: DotSizeSectionProps) {
  const t = useTranslations("editor.controlSections.dotSizeSection");
  const { value } = dotSize(style);

  return (
    <ControlSection
      expanded={expanded}
      section="dot-size"
      summary={`${value}%`}
      title={t("dotSize")}
    >
      <DotSizeControl onChange={onChange} style={style} />
    </ControlSection>
  );
}
