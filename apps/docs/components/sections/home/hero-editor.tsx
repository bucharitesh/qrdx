"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { ArrowRight } from "iconsax-reactjs";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { QRCode } from "qrdx";
import { useState } from "react";
import { ScanScoreBadge } from "@/components/editor/scan-score";
import { AsciiField } from "@/components/fx";
import { DURATION, EASE } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import type { QRStyle } from "@/types/theme";
import { FAMILY, FAMILY_GRADIENT, INK } from "./demos/qr-family";

// The same style family as the hero code above: ink on white, brand blue
// only as an accent.
const STYLES = {
  classic: {
    label: "Classic",
    style: {
      ...FAMILY,
      dotColor: INK,
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
    },
  },
  rounded: { label: "Rounded", style: FAMILY },
  dots: {
    label: "Dots",
    style: {
      ...FAMILY,
      bodyPattern: "circle",
      cornerEyePattern: "circle",
      cornerEyeDotPattern: "circle",
    },
  },
  gradient: { label: "Gradient", style: FAMILY_GRADIENT },
} satisfies Record<string, { label: string; style: QRStyle }>;

const FRAMES = {
  none: { label: "No frame", frame: undefined },
  banner: {
    label: "Scan me",
    frame: { style: "banner-bottom", text: "Scan me", color: INK },
  },
  border: {
    label: "Border",
    frame: { style: "rounded-border", text: "", color: INK },
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
    <Card className="grid gap-0 overflow-hidden py-0 md:grid-cols-[1fr_minmax(0,22rem)]">
      <div className="order-last flex flex-col gap-5 border-t p-5 md:order-first md:border-t-0 md:border-r md:p-8">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Try it with your link
          </p>
          <p className="text-sm text-muted-foreground">
            Same renderer as the playground, live as you type.
          </p>
        </div>
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
      <div className="relative flex flex-col items-center justify-center gap-4 bg-muted/40 p-6 md:p-8">
        <AsciiField
          variant="qr"
          density={1.1}
          radius={120}
          className="opacity-70 [mask-image:radial-gradient(ellipse_at_center,transparent_30%,black_75%)]"
        />
        <div
          aria-live="polite"
          className="relative flex aspect-square w-full max-w-64 items-center justify-center [&_svg]:size-full"
        >
          {trimmed ? (
            <motion.div
              key={`${styleKey}-${frameKey}`}
              // Same initial on server and client (useReducedMotion is null
              // during SSR); reduced motion only skips the transition.
              initial={{ opacity: 0.4, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: reduce ? 0 : DURATION.base, ease: EASE }}
              className="size-full rounded-2xl bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_16px_32px_-16px_rgba(0,0,0,0.3)] ring-1 ring-black/5"
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
        {trimmed && (
          <ScanScoreBadge className="relative" style={style} value={trimmed} />
        )}
      </div>
    </Card>
  );
}
