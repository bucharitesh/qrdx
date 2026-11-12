"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import {
  FRAME_ICONS,
  FRAME_TEXT_MAX_LENGTH,
  type FrameSpecIcon,
  getFrameIconPath,
  type QRCustomFrame,
} from "qrdx";
import { soundEvent } from "@/lib/sound/emit";
import { FrameColorField, FrameTextSize } from "./frame-fields";
import {
  customFrameColors,
  labelOfSlot,
  specIcons,
  specTokens,
  swapSpecIcon,
} from "./frame-specs";

/**
 * A custom frame's labels, colors and icons, edited through its spec: the
 * labels fill the spec's primary and secondary slots, the colors set the
 * theme tokens it paints with, and an icon swap rewrites its icon shapes.
 */
export function CustomFrameFields({
  frame,
  onChange,
}: {
  frame: QRCustomFrame;
  onChange: (frame: QRCustomFrame) => void;
}) {
  const t = useTranslations("editor.controlSections.customFrameFields");
  const { spec } = frame;
  const primary = labelOfSlot(spec, "primary");
  const secondary = labelOfSlot(spec, "secondary");
  const tokens = specTokens(spec);
  const colors = customFrameColors(frame);
  const icons = specIcons(spec);
  const update = (changes: Partial<QRCustomFrame>) =>
    onChange({ ...frame, ...changes });

  return (
    <>
      {primary && (
        <FrameLabelField
          id="frame-text"
          label={t("label")}
          max={primary.maxLength ?? FRAME_TEXT_MAX_LENGTH}
          onChange={(text) => update({ text })}
          placeholder={t("leaveEmptyForNoLabel")}
          value={frame.text ?? primary.text}
        />
      )}
      {secondary && (
        <FrameLabelField
          id="frame-secondary-text"
          label={t("secondLine")}
          max={secondary.maxLength ?? FRAME_TEXT_MAX_LENGTH}
          onChange={(secondaryText) => update({ secondaryText })}
          placeholder={t("leaveEmptyToHideIt")}
          value={frame.secondaryText ?? secondary.text}
        />
      )}
      {!(primary || secondary) && (
        <p className="text-muted-foreground text-xs">
          {t("thisFrameHasNoLabels")}
        </p>
      )}

      {tokens.size > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {tokens.has("frame") && (
            <FrameColorField
              id="frame-color"
              label={t("frameColor")}
              onChange={(color) => update({ color })}
              value={colors.frame}
            />
          )}
          {tokens.has("text") && (
            <FrameColorField
              id="frame-text-color"
              label={t("textColor")}
              onChange={(textColor) => update({ textColor })}
              value={colors.text}
            />
          )}
          {tokens.has("accent") && (
            <FrameColorField
              id="frame-accent-color"
              label={t("accentColor")}
              onChange={(secondaryColor) => update({ secondaryColor })}
              value={colors.accent}
            />
          )}
        </div>
      )}

      {icons.map((icon) => (
        <IconPicker
          current={icon}
          key={icon}
          onPick={(next) => {
            update({ spec: swapSpecIcon(spec, icon, next) });
            soundEvent("tick");
          }}
          taken={icons.filter((other) => other !== icon)}
        />
      ))}

      {spec.labels.length > 0 && (
        <FrameTextSize
          onChange={(fontScale) => update({ fontScale })}
          value={frame.fontScale ?? 1}
        />
      )}
    </>
  );
}

function FrameLabelField({
  id,
  label,
  value,
  max,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs" htmlFor={id}>
          {label}
        </Label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {value.length}/{max}
        </span>
      </div>
      <Input
        id={id}
        maxLength={max}
        onChange={(event) => onChange(event.target.value.slice(0, max))}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

const ICON_NAMES: Partial<Record<FrameSpecIcon, string>> = {
  wifi: "Wi-Fi",
  pin: "Location pin",
  bag: "Shopping bag",
  cup: "Cup",
  card: "Card",
  check: "Check mark",
  info: "Info",
};

const iconName = (icon: FrameSpecIcon) =>
  ICON_NAMES[icon] ?? `${icon.charAt(0).toUpperCase()}${icon.slice(1)}`;

/** The frame's icon: one of the engine's glyphs (no images). */
export function IconPicker({
  current,
  taken,
  onPick,
}: {
  current: FrameSpecIcon;
  taken: FrameSpecIcon[];
  onPick: (icon: FrameSpecIcon) => void;
}) {
  const t = useTranslations("editor.controlSections.customFrameFields");
  return (
    <fieldset className="m-0 min-w-0 space-y-1.5 border-0 p-0">
      <legend className="mb-1.5 text-xs font-medium">{t("icon")}</legend>
      <div className="grid grid-cols-8 gap-1.5">
        {FRAME_ICONS.filter((icon) => !taken.includes(icon)).map((icon) => {
          const path = getFrameIconPath(icon);
          const selected = icon === current;
          return (
            <button
              aria-label={iconName(icon)}
              aria-pressed={selected}
              className={cn(
                "bg-card grid aspect-square place-items-center rounded-md border transition-colors outline-none",
                "hover:border-foreground/20 hover:bg-accent/40 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
                selected && "border-foreground/40 bg-accent/60",
              )}
              key={icon}
              onClick={() => onPick(icon)}
              title={iconName(icon)}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="size-4"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  clipRule={path.fillRule}
                  d={path.d}
                  fillRule={path.fillRule}
                />
              </svg>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
