"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type ColorConfig, getColorString } from "qrdx";
import { useMemo } from "react";
import { CodeQr } from "@/app/dashboard/codes/_components/code-qr";
import type { SavedTheme } from "@/app/dashboard/themes/_lib/theme";
import ControlSection from "@/components/editor/control-section";
import { ColorPresets } from "@/components/editor/control-sections/color-presets";
import {
  FrameControls,
  frameName,
} from "@/components/editor/control-sections/frame-controls";
import { LogoControls } from "@/components/editor/control-sections/logo-controls";
import {
  DotPatternControl,
  EyeControls,
  eyeSummary,
  patternName,
} from "@/components/editor/control-sections/pattern-controls";
import { SidePanelPlacement } from "@/components/editor/control-sections/side-panel";
import {
  GradientPicker,
  PaintDesignProvider,
  QR_IMAGE_KINDS,
} from "@/components/editor/gradient-picker";
import { QRStyleScopeProvider } from "@/components/editor/style-scope";
import { defaultThemeState } from "@/config/qr";
import { designColors } from "@/lib/paint/swatches";
import { soundEvent } from "@/lib/sound/emit";
import type { QRStyle } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";

/** Built-in themes in the strip: the library's featured ones come first. */
const BUILT_IN_COUNT = 7;
/** Saved themes in the strip, after the workspace default. */
const SAVED_COUNT = 4;

interface ThemeChoice {
  id: string;
  name: string;
  style: QRStyle;
  isDefault: boolean;
}

/** A theme applied over the defaults, as the playground applies presets. */
export const themeLook = (style: QRStyle): QRStyle => ({
  ...defaultThemeState.styles,
  ...style,
});

const sameLook = (a: QRStyle, b: QRStyle) =>
  JSON.stringify(themeLook(a)) === JSON.stringify(themeLook(b));

/** The workspace default and recent saved themes, then built-in ones. */
export function themeChoices(saved: SavedTheme[]): ThemeChoice[] {
  const workspaceDefault = saved.find((theme) => theme.isActiveDefault);
  const recent = saved
    .filter((theme) => theme !== workspaceDefault)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, SAVED_COUNT);
  const builtIn = Object.entries(defaultPresets)
    .slice(0, BUILT_IN_COUNT)
    .map(([id, preset]) => ({
      id: `built-in:${id}`,
      name: preset.label ?? id,
      style: preset.styles,
      isDefault: false,
    }));
  return [
    ...(workspaceDefault
      ? [
          {
            id: workspaceDefault.id,
            name: workspaceDefault.name,
            style: workspaceDefault.style,
            isDefault: true,
          },
        ]
      : []),
    ...recent.map((theme) => ({
      id: theme.id,
      name: theme.name,
      style: theme.style,
      isDefault: false,
    })),
    ...builtIn,
  ];
}

function Swatches({ colors }: { colors: (ColorConfig | undefined)[] }) {
  return (
    <span className="flex -space-x-1">
      {colors.map((color, index) => (
        <span
          className="ring-background size-3.5 rounded-full border ring-2"
          key={index}
          style={{ background: color ? getColorString(color) : undefined }}
        />
      ))}
    </span>
  );
}

function ThemeStrip({
  choices,
  style,
  onPick,
}: {
  choices: ThemeChoice[];
  style: QRStyle;
  onPick: (style: QRStyle) => void;
}) {
  const active = choices.find((choice) => sameLook(choice.style, style));
  return (
    <fieldset
      aria-label="Themes"
      className="m-0 grid min-w-0 grid-cols-4 gap-2 border-0 p-0 @[20rem]:grid-cols-5"
    >
      {choices.map((choice) => {
        const selected = active?.id === choice.id;
        return (
          <button
            aria-label={
              choice.isDefault
                ? `${choice.name}, the workspace default theme`
                : `${choice.name} theme`
            }
            aria-pressed={selected}
            className={cn(
              "group bg-card relative flex min-w-0 flex-col items-center gap-1 rounded-lg border p-1 pb-1.5 transition-colors outline-none",
              "hover:border-foreground/20 hover:bg-accent/40 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
              selected && "border-foreground/40 bg-accent/60",
            )}
            key={choice.id}
            onClick={() => {
              onPick(themeLook(choice.style));
              soundEvent("apply");
            }}
            title={choice.name}
            type="button"
          >
            <CodeQr
              className="w-full rounded-md bg-white"
              style={themeLook(choice.style)}
              value="https://qrdx.dev"
            />
            <span className="text-muted-foreground w-full truncate text-center text-[10px] leading-tight">
              {choice.isDefault ? "Default" : choice.name}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * Quick design choices beside the preview: themes, colors, dots, eyes, logo
 * and frame. The playground's own pickers, pointed at the builder's design
 * through QRStyleScopeProvider, so the playground's saved state is untouched.
 */
export function BuilderStyle({
  style,
  onChange,
  value,
  themes,
}: {
  style: QRStyle;
  onChange: (style: QRStyle) => void;
  /** What the code encodes, for the pickers' own scan checks */
  value: string;
  /** Saved themes of the workspace; null while loading */
  themes: SavedTheme[] | null;
}) {
  const current = useMemo(() => themeLook(style), [style]);
  const choices = useMemo(() => themeChoices(themes ?? []), [themes]);
  // The pickers' Theme swatches: the workspace's default theme
  const paintDesign = useMemo(() => {
    const workspaceDefault = choices.find((choice) => choice.isDefault);
    return {
      themeColors: workspaceDefault
        ? designColors(themeLook(workspaceDefault.style))
        : undefined,
    };
  }, [choices]);
  const update = <K extends keyof QRStyle>(key: K, next: QRStyle[K]) =>
    onChange({ ...current, [key]: next });

  return (
    <QRStyleScopeProvider onChange={onChange} style={current} value={value}>
      <PaintDesignProvider value={paintDesign}>
        {/* The style column is on the modal's right: panels open to its left. */}
        <SidePanelPlacement side="left">
          <div className="@container">
            <ControlSection
              expanded
              summary={
                choices.find((choice) => sameLook(choice.style, current))?.name
              }
              title="Theme"
            >
              <ThemeStrip choices={choices} onPick={onChange} style={current} />
            </ControlSection>
            <ControlSection
              hint="colors"
              summary={
                <Swatches
                  colors={[
                    current.bgColor,
                    current.fgColor,
                    current.eyeColor,
                    current.dotColor,
                  ]}
                />
              }
              title="Colors"
            >
              <div className="grid grid-cols-2 gap-2">
                <GradientPicker
                  kinds={QR_IMAGE_KINDS}
                  label="Background"
                  name="bgColor"
                  onChange={(color) => update("bgColor", color)}
                  value={current.bgColor}
                />
                <GradientPicker
                  kinds={QR_IMAGE_KINDS}
                  label="Foreground"
                  name="fgColor"
                  onChange={(color) => update("fgColor", color)}
                  value={current.fgColor}
                />
                <GradientPicker
                  kinds={QR_IMAGE_KINDS}
                  label="Eyes"
                  name="eyeColor"
                  onChange={(color) => update("eyeColor", color)}
                  value={current.eyeColor}
                />
                <GradientPicker
                  kinds={QR_IMAGE_KINDS}
                  label="Dots"
                  name="dotColor"
                  onChange={(color) => update("dotColor", color)}
                  value={current.dotColor}
                />
              </div>
              <ColorPresets
                onApply={(colors) => onChange({ ...current, ...colors })}
                style={current}
              />
            </ControlSection>
            <ControlSection
              hint="dots"
              summary={patternName(current.bodyPattern)}
              title="Dots"
            >
              <DotPatternControl />
            </ControlSection>
            <ControlSection
              hint="eyes"
              popover
              summary={eyeSummary(
                current.cornerEyePattern,
                current.cornerEyeDotPattern,
              )}
              title="Eyes"
            >
              <EyeControls />
            </ControlSection>
            <LogoControls
              onStyleChange={(next) =>
                onChange({
                  ...current,
                  customLogo: next.customLogo,
                  showLogo: next.showLogo,
                })
              }
              style={current}
            />
            <ControlSection
              hint="frame"
              popover
              summary={frameName(current.frame)}
              title="Frame"
            >
              <FrameControls />
            </ControlSection>
          </div>
        </SidePanelPlacement>
      </PaintDesignProvider>
    </QRStyleScopeProvider>
  );
}
