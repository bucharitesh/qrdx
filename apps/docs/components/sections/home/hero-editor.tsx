"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { QRCode } from "qrdx";
import { useState } from "react";
import { ScanScoreBadge } from "@/components/editor/scan-score";
import { DURATION, EASE } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import type { QRStyle } from "@/types/theme";

const STYLES = {
  classic: {
    label: "Classic",
    style: {
      bgColor: "#ffffff",
      fgColor: "#0a0a0a",
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
    },
  },
  rounded: {
    label: "Rounded",
    style: {
      bgColor: "#ffffff",
      fgColor: "#0f172a",
      eyeColor: "#155dfc",
      dotColor: "#155dfc",
      bodyPattern: "rounded",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "rounded",
    },
  },
  dots: {
    label: "Dots",
    style: {
      bgColor: "#ffffff",
      fgColor: "#1e3a8a",
      eyeColor: "#1e3a8a",
      dotColor: "#155dfc",
      bodyPattern: "circle",
      cornerEyePattern: "circle",
      cornerEyeDotPattern: "circle",
    },
  },
  gradient: {
    label: "Gradient",
    style: {
      bgColor: "#ffffff",
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#155dfc", offset: 0 },
          { color: "#7c3aed", offset: 100 },
        ],
      },
      eyeColor: "#155dfc",
      dotColor: "#7c3aed",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded",
    },
  },
} satisfies Record<string, { label: string; style: QRStyle }>;

const FRAMES = {
  none: { label: "No frame", frame: undefined },
  banner: {
    label: "Scan me",
    frame: { style: "banner-bottom", text: "Scan me", color: "#155dfc" },
  },
  border: {
    label: "Border",
    frame: { style: "rounded-border", text: "", color: "#0f172a" },
  },
} satisfies Record<string, { label: string; frame: QRStyle["frame"] }>;

type StyleKey = keyof typeof STYLES;
type FrameKey = keyof typeof FRAMES;

const styleOptions = (Object.keys(STYLES) as StyleKey[]).map((value) => ({
  value,
  label: STYLES[value].label,
}));
const frameOptions = (Object.keys(FRAMES) as FrameKey[]).map((value) => ({
  value,
  label: FRAMES[value].label,
}));

/** Hero mini-editor: the real qrdx renderer and scan score, live as you type. */
export function HeroEditor() {
  const [value, setValue] = useState("https://qrdx.dev");
  const [styleKey, setStyleKey] = useState<StyleKey>("rounded");
  const [frameKey, setFrameKey] = useState<FrameKey>("banner");
  const reduce = useReducedMotion();

  const style: QRStyle = {
    ...STYLES[styleKey].style,
    level: "Q",
    frame: FRAMES[frameKey].frame,
  };
  const trimmed = value.trim();

  return (
    <div className="grid overflow-hidden rounded-2xl border border-border bg-background/80 shadow-xl shadow-black/5 backdrop-blur md:grid-cols-[1fr_minmax(0,22rem)] dark:shadow-black/40">
      <div className="order-last flex flex-col gap-5 border-t border-border p-5 md:order-first md:border-t-0 md:border-r md:p-8">
        <div className="flex flex-col gap-2">
          <Label htmlFor="hero-qr-value">Your link or text</Label>
          <Input
            id="hero-qr-value"
            value={value}
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://example.com"
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Style</span>
          <SegmentedControl
            label="Style"
            options={styleOptions}
            value={styleKey}
            onChange={setStyleKey}
            className="w-fit"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Frame</span>
          <SegmentedControl
            label="Frame"
            options={frameOptions}
            value={frameKey}
            onChange={setFrameKey}
            className="w-fit"
          />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The full playground adds 29 shapes, any colors and gradients, logos,
          templates and PNG, SVG, JPG or PDF downloads.
        </p>
        <Button asChild className="w-fit">
          <Link href="/playground">
            Customise in the playground
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 bg-muted/40 p-6 md:p-8">
        <div
          aria-live="polite"
          className="flex aspect-square w-full max-w-64 items-center justify-center [&_svg]:size-full"
        >
          {trimmed ? (
            <motion.div
              key={`${styleKey}-${frameKey}`}
              initial={reduce ? false : { opacity: 0.4, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: DURATION.base, ease: EASE }}
              className="size-full rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5"
              role="img"
              aria-label={`QR code for ${trimmed}`}
            >
              <QRCode
                value={trimmed}
                size={256}
                level="Q"
                hideLogo
                bgColor={style.bgColor}
                fgColor={style.fgColor}
                eyeColor={style.eyeColor}
                dotColor={style.dotColor}
                bodyPattern={style.bodyPattern}
                cornerEyePattern={style.cornerEyePattern}
                cornerEyeDotPattern={style.cornerEyeDotPattern}
                frame={style.frame}
              />
            </motion.div>
          ) : (
            <p className="px-6 text-center text-sm text-muted-foreground">
              Type a link to see your QR code.
            </p>
          )}
        </div>
        {trimmed && <ScanScoreBadge style={style} value={trimmed} />}
      </div>
    </div>
  );
}
