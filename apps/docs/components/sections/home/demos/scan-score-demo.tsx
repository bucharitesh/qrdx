"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { QRCode } from "qrdx";
import { useState } from "react";
import { ScanScoreBadge } from "@/components/editor/scan-score";
import { QrTile } from "./demo-ui";

const HUE = 222;
const SATURATION = 70;

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const value =
      light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** Lighten the code and watch the real scan score react. */
export function ScanScoreDemo() {
  const [lightness, setLightness] = useState(20);
  const fg = hslToHex(HUE, SATURATION, lightness);
  const contrast = (1.05 / (luminance(fg) + 0.05)).toFixed(1);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <QrTile
        label={`QR code with a code color of ${fg} on white`}
        className="w-full max-w-40"
      >
        <QRCode
          value="https://qrdx.dev"
          size={160}
          level="Q"
          hideLogo
          bgColor="#ffffff"
          fgColor={fg}
          bodyPattern="rounded"
          cornerEyePattern="rounded"
          cornerEyeDotPattern="rounded"
        />
      </QrTile>
      <ScanScoreBadge
        value="https://qrdx.dev"
        style={{
          bgColor: "#ffffff",
          fgColor: fg,
          bodyPattern: "rounded",
          cornerEyePattern: "rounded",
          cornerEyeDotPattern: "rounded",
          level: "Q",
        }}
      />
      <div className="flex w-full max-w-60 flex-col gap-2.5">
        <Label
          htmlFor="scan-demo-lightness"
          className="justify-between text-xs"
        >
          <span>Code color lightness</span>
          <span className="tabular-nums text-muted-foreground">
            {contrast}:1 contrast
          </span>
        </Label>
        <Slider
          id="scan-demo-lightness"
          min={5}
          max={90}
          step={5}
          value={[lightness]}
          onValueChange={([next]) => setLightness(next ?? 20)}
          aria-label="Code color lightness"
        />
      </div>
    </div>
  );
}
