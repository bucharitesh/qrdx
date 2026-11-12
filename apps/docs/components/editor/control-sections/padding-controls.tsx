"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Slider } from "@repo/design-system/components/ui/slider";
import { useTranslations } from "next-intl";

const MAX_PADDING = 10;

// Names in messages/en.json: editor.controlSections.paddingControls.presets.
const PRESETS = [
  { id: "none", value: 0 },
  { id: "small", value: 2 },
  { id: "standard", value: 4 },
  { id: "large", value: 8 },
] as const;

interface PaddingControlsProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

export function PaddingControls({ value = 0, onChange }: PaddingControlsProps) {
  const t = useTranslations("editor.controlSections.paddingControls");
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {t("quietZoneAroundTheCode")}
        </span>
        <span className="tabular-nums">
          {value} {value === 1 ? t("module") : t("modules")}
        </span>
      </div>
      <Slider
        aria-label={t("padding")}
        max={MAX_PADDING}
        min={0}
        onValueChange={([next]) => onChange(next ?? 0)}
        step={1}
        value={[value]}
      />
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset.value}
            onClick={() => onChange(preset.value)}
            size="sm"
            type="button"
            variant={value === preset.value ? "secondary" : "outline"}
          >
            {t(`presets.${preset.id}`)}
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {t("scannersNeedABlankBorder")}
      </p>
    </div>
  );
}
