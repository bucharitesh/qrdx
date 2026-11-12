"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Gps } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { getLogoSizeLimit } from "qrdx";
import {
  AUTO_LEVEL_LOGO_COVERAGE,
  LOGO_PADDING_MAX,
  LOGO_SIZE_DEFAULT,
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  type LogoOptions,
} from "qrdx/types";
import * as React from "react";
import ControlSection from "@/components/editor/control-section";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/theme";
import { LogoCropControls, useLogoShapeNames } from "./logo-crop-controls";

const percent = (share: number) => Math.round(share * 100);

/** A labelled slider row: name on the left, value on the right. */
function SliderRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  );
}

interface LogoOptionsSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (change: Partial<QRStyle>) => void;
}

/**
 * The logo options with `change` applied, as a style change. Defaults are
 * left out, so an untouched logo saves as before.
 */
export function logoOptionsChange(
  options: LogoOptions,
  change: Partial<LogoOptions>,
): Pick<QRStyle, "logoOptions"> {
  const next: LogoOptions = { ...options, ...change };
  for (const key of Object.keys(next) as (keyof LogoOptions)[]) {
    if (next[key] === undefined) delete next[key];
  }
  if (next.size === LOGO_SIZE_DEFAULT) delete next.size;
  if (next.padding === 0) delete next.padding;
  if (next.x === 0.5 && next.y === 0.5) {
    delete next.x;
    delete next.y;
  }
  return { logoOptions: Object.keys(next).length > 0 ? next : undefined };
}

/**
 * The logo's size as drawn and the range the slider offers: the largest
 * logo this code's error correction can repair, block by block (qrdx
 * getLogoSizeLimit); the engine caps a bigger one to it.
 */
export function useLogoSize(style: QRStyle) {
  const options = style.logoOptions ?? {};
  const size = options.size ?? LOGO_SIZE_DEFAULT;
  const padding = options.padding ?? 0;
  const x = options.x ?? 0.5;
  const y = options.y ?? 0.5;
  const value = useQREditorStore((state) => state.value);
  const limit = React.useMemo(
    () =>
      value.trim()
        ? getLogoSizeLimit({
            value,
            level: style.level,
            margin: style.margin,
            shape: style.shape,
            autoLevel: style.autoLevel,
            logoOptions: { padding, x, y },
          })
        : LOGO_SIZE_MAX,
    [
      value,
      style.level,
      style.margin,
      style.shape,
      style.autoLevel,
      padding,
      x,
      y,
    ],
  );
  const maxPercent = Math.floor(limit * 100 + 1e-6);
  return {
    maxPercent,
    capped: maxPercent < percent(LOGO_SIZE_MAX),
    shown: Math.min(percent(size), maxPercent),
    minPercent: Math.min(percent(LOGO_SIZE_MIN), maxPercent),
  };
}

/** The logo's size slider, with why it stops short when it does. */
export function LogoSizeControl({
  style,
  onChange,
}: {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (change: Partial<QRStyle>) => void;
}) {
  const t = useTranslations("editor.controlSections.logoOptionsSection");
  const { maxPercent, capped, shown, minPercent } = useLogoSize(style);
  return (
    <SliderRow label={t("size")} value={`${shown}% of the code`}>
      <Slider
        aria-label={t("logoSize")}
        disabled={maxPercent <= minPercent}
        max={Math.max(maxPercent, minPercent + 1)}
        min={minPercent}
        onValueChange={([next]) =>
          onChange(
            logoOptionsChange(style.logoOptions ?? {}, {
              size: (next ?? percent(LOGO_SIZE_DEFAULT)) / 100,
            }),
          )
        }
        step={1}
        value={[shown]}
      />
      {capped && (
        <p className="text-muted-foreground text-xs text-pretty">
          {maxPercent > 0
            ? t("upToMaxpercentForThis", { maxPercent })
            : t("thisCodeIsTooSmall")}{" "}
          {style.level === "H"
            ? t("shorterContentMakesRoom")
            : t("levelHOrShorterContent")}
        </p>
      )}
    </SliderRow>
  );
}

/** Clear space around the logo, in modules (logoOptions.padding). */
export function LogoClearSpaceControl({
  style,
  onChange,
}: {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (change: Partial<QRStyle>) => void;
}) {
  const t = useTranslations("editor.controlSections.logoOptionsSection");
  const padding = style.logoOptions?.padding ?? 0;
  return (
    <SliderRow
      label={t("clearSpace")}
      value={`${padding} ${padding === 1 ? "module" : "modules"}`}
    >
      <Slider
        aria-label={t("clearSpaceAroundTheLogo")}
        max={LOGO_PADDING_MAX}
        min={0}
        onValueChange={([next]) =>
          onChange(
            logoOptionsChange(style.logoOptions ?? {}, { padding: next ?? 0 }),
          )
        }
        step={1}
        value={[padding]}
      />
    </SliderRow>
  );
}

/** The switch that raises error correction to H for a big logo (autoLevel). */
export function AutoLevelControl({
  style,
  onChange,
}: {
  style: QRStyle;
  onChange: (change: Partial<QRStyle>) => void;
}) {
  const t = useTranslations("editor.controlSections.logoOptionsSection");
  const id = React.useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-0.5">
        <Label className="cursor-pointer text-sm" htmlFor={id}>
          {t("raiseErrorCorrectionForBig")}
        </Label>
        <p className="text-muted-foreground text-xs">
          {t("switchesToLevelHWhen", {
            value: percent(AUTO_LEVEL_LOGO_COVERAGE),
          })}
        </p>
      </div>
      <Switch
        checked={style.autoLevel ?? false}
        id={id}
        onCheckedChange={(value) =>
          onChange({ autoLevel: value ? true : undefined })
        }
      />
    </div>
  );
}

/**
 * The logo's shape, plate and background, its size, clear space and
 * position, and automatic error correction. Shown while the logo is on.
 */
export function LogoOptionsSection({
  style,
  onChange,
}: LogoOptionsSectionProps) {
  const logoShapeNames = useLogoShapeNames();
  const t = useTranslations("editor.controlSections.logoOptionsSection");
  const options = style.logoOptions ?? {};
  const x = options.x ?? 0.5;
  const y = options.y ?? 0.5;
  const centered = x === 0.5 && y === 0.5;
  const { shown } = useLogoSize(style);

  const setOptions = (change: Partial<LogoOptions>) =>
    onChange(logoOptionsChange(options, change));

  const shape = options.shape ?? "square";

  return (
    <ControlSection
      id="section-logo-options"
      summary={[
        // The size it is drawn at (capped to what the code can repair)
        `${shown}%`,
        shape !== "square" && logoShapeNames[shape].toLowerCase(),
        !centered && "moved",
      ]
        .filter(Boolean)
        .join(" · ")}
      title={t("logoOptions")}
    >
      <LogoCropControls
        onChange={onChange}
        setOptions={setOptions}
        style={style}
      />

      <LogoSizeControl onChange={onChange} style={style} />

      <LogoClearSpaceControl onChange={onChange} style={style} />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">{t("position")}</span>
          <Button
            disabled={centered}
            onClick={() => setOptions({ x: 0.5, y: 0.5 })}
            size="sm"
            type="button"
            variant="outline"
          >
            <Gps />
            {t("center")}
          </Button>
        </div>
        <SliderRow label={t("leftToRight")} value={`${percent(x)}%`}>
          <Slider
            aria-label={t("logoPositionLeftToRight")}
            max={100}
            min={0}
            onValueChange={([next]) => setOptions({ x: (next ?? 50) / 100 })}
            step={1}
            value={[percent(x)]}
          />
        </SliderRow>
        <SliderRow label={t("topToBottom")} value={`${percent(y)}%`}>
          <Slider
            aria-label={t("logoPositionTopToBottom")}
            max={100}
            min={0}
            onValueChange={([next]) => setOptions({ y: (next ?? 50) / 100 })}
            step={1}
            value={[percent(y)]}
          />
        </SliderRow>
        <p className="text-muted-foreground text-xs text-pretty">
          {t("keepTheLogoOffThe")}
        </p>
      </div>

      <AutoLevelControl onChange={onChange} style={style} />
    </ControlSection>
  );
}
