"use client";

import { type ColorConfig, getColorString } from "qrdx";
import * as React from "react";
import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import { defaultThemeState } from "@/config/qr";
import type { QRStyle } from "@/types/theme";
import { ArtControls } from "./art-controls";
import { ColorPresets } from "./color-presets";
import { FrameControls, frameName } from "./frame-controls";
import { LogoControls } from "./logo-controls";
import { PaddingControls } from "./padding-controls";
import {
  BorderControl,
  DotPatternControl,
  ERROR_LEVELS,
  ErrorLevelControl,
  EyeControls,
  eyeSummary,
  patternName,
} from "./pattern-controls";

/**
 * On phones, opening a section closes the others so the panel never grows
 * into a long scroll. Section headers are `h3 > button[aria-expanded]`.
 */
function closeOtherSections(event: React.MouseEvent<HTMLElement>) {
  if (!window.matchMedia("(max-width: 767px)").matches) return;
  const header = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "section > div > h3 > button[aria-expanded]",
  );
  if (!header || header.getAttribute("aria-expanded") === "true") return;
  for (const other of event.currentTarget.querySelectorAll<HTMLButtonElement>(
    'section > div > h3 > button[aria-expanded="true"]',
  )) {
    if (other !== header) other.click();
  }
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

interface DesignControlsProps {
  styles: QRStyle;
  onChange: (styles: QRStyle) => void;
  /** Open and scroll to a section (the old "Settings" tab maps to Logo) */
  focus?: "logo";
}

/** The Design tab: every style control, top to bottom, as one accordion. */
export function DesignControls({
  styles,
  onChange,
  focus,
}: DesignControlsProps) {
  const current = React.useMemo(
    () => ({ ...defaultThemeState.styles, ...styles }),
    [styles],
  );

  const updateStyle = <K extends keyof QRStyle>(key: K, value: QRStyle[K]) => {
    onChange({ ...styles, [key]: value });
  };

  React.useEffect(() => {
    if (focus !== "logo") return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById("section-logo")
        ?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  const level = ERROR_LEVELS.find((item) => item.id === (current.level || "L"));
  const frameStyle = current.frame?.style ?? "none";
  const frameSummary =
    frameStyle !== "none"
      ? frameName(frameStyle)
      : current.templateId && current.templateId !== "default"
        ? "Border"
        : "None";
  const margin = current.margin ?? 0;

  return (
    <div className="@container" onClickCapture={closeOtherSections}>
      <ControlSection
        expanded
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
            label="Background"
            name="bgColor"
            onChange={(color) => updateStyle("bgColor", color)}
            value={current.bgColor}
          />
          <GradientPicker
            label="Foreground"
            name="fgColor"
            onChange={(color) => updateStyle("fgColor", color)}
            value={current.fgColor}
          />
          <GradientPicker
            label="Eyes"
            name="eyeColor"
            onChange={(color) => updateStyle("eyeColor", color)}
            value={current.eyeColor}
          />
          <GradientPicker
            label="Dots"
            name="dotColor"
            onChange={(color) => updateStyle("dotColor", color)}
            value={current.dotColor}
          />
        </div>
        {/* Palettes sit right under the four colors they set. */}
        <ColorPresets
          onApply={(colors) => onChange({ ...styles, ...colors })}
          style={current}
        />
      </ControlSection>

      <ControlSection
        expanded
        hint="dots"
        summary={patternName(current.bodyPattern)}
        title="Dots"
      >
        <DotPatternControl />
      </ControlSection>

      <ControlSection
        hint="eyes"
        summary={eyeSummary(
          current.cornerEyePattern,
          current.cornerEyeDotPattern,
        )}
        title="Eyes"
      >
        <EyeControls />
      </ControlSection>

      <LogoControls
        expanded={focus === "logo"}
        onStyleChange={(next) =>
          onChange({
            ...styles,
            customLogo: next.customLogo,
            showLogo: next.showLogo,
          })
        }
        style={current}
      />

      <ControlSection hint="frame" summary={frameSummary} title="Frame">
        <BorderControl />
        <FrameControls />
      </ControlSection>

      <ControlSection
        hint="quiet-zone"
        summary={`${margin} ${margin === 1 ? "module" : "modules"}`}
        title="Padding"
      >
        <PaddingControls
          onChange={(value) => updateStyle("margin", value)}
          value={current.margin}
        />
      </ControlSection>

      <ArtControls onChange={onChange} styles={styles} />

      <ControlSection
        hint="error-correction"
        summary={level ? `${level.name} · ${level.recovery}` : undefined}
        title="Error correction"
      >
        <ErrorLevelControl />
      </ControlSection>
    </div>
  );
}
