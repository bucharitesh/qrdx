"use client";

import * as React from "react";
import { defaultThemeState } from "@/config/qr";
import type { DesignSection } from "@/lib/playground-links";
import type { QRStyle } from "@/types/theme";
import { DotSizeSection } from "./dot-size-section";
import { EyeColorsSection } from "./eye-colors-section";
import { LogoOptionsSection } from "./logo-options-section";

interface CustomizationSectionsProps {
  styles: QRStyle;
  onChange: (styles: QRStyle) => void;
  /** The section a link asked for (opens it) */
  focus?: DesignSection;
}

/**
 * Engine options the Design tab adds after the Logo section: logo options
 * (while a logo is on), per-eye colors and dot size (the code's shape is a
 * choice in Frame). One component, so design-controls.tsx wires them in a
 * single place.
 */
export function CustomizationSections({
  styles,
  onChange,
  focus,
}: CustomizationSectionsProps) {
  const current = React.useMemo(
    () => ({ ...defaultThemeState.styles, ...styles }),
    [styles],
  );
  const update = (change: Partial<QRStyle>) => {
    const next: QRStyle = { ...styles, ...change };
    // Cleared options leave the style, so it saves and links as before
    for (const key of Object.keys(change) as (keyof QRStyle)[]) {
      if (next[key] === undefined) delete next[key];
    }
    onChange(next);
  };

  return (
    <>
      {current.showLogo && (
        <LogoOptionsSection onChange={update} style={current} />
      )}
      <EyeColorsSection
        expanded={focus === "eye-colors"}
        onChange={(eyeColors) => update({ eyeColors })}
        style={current}
      />
      <DotSizeSection
        expanded={focus === "dot-size"}
        onChange={(moduleScale) => update({ moduleScale })}
        style={current}
      />
    </>
  );
}
