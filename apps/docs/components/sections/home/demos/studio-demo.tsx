"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { QRCodeSVG } from "qrdx";
import {
  BODY_PATTERN,
  type BodyPattern,
  CORNER_EYE_PATTERNS,
  type ColorConfig,
  type CornerEyePattern,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
  type FrameStyle,
} from "qrdx/types";
import { useId, useState } from "react";
import { DURATION, EASE } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import {
  SHOWCASE_ACCENT as ACCENT,
  SHOWCASE_INK as INK,
  SHOWCASE_PLACEMENTS,
  SHOWCASE_STYLES,
  showcaseThemeStyles,
} from "@/lib/landing/showcase-styles";
import { playgroundHref } from "@/lib/playground-links";
import { packStyleParam } from "@/lib/playground-style-pack";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import type { QRStyle } from "@/types/theme";
import { HOME_CODES } from "./codes";
import { Chip, DemoStage, humanize, QrTile, Readout } from "./demo-ui";

type Tab = "patterns" | "colors" | "frames";

const TABS = [
  { value: "patterns", label: "Patterns" },
  { value: "colors", label: "Colors" },
  { value: "frames", label: "Frames" },
] as const;

export interface Swatch {
  id: string;
  label: string;
  fg: (angle: number) => ColorConfig;
  eye: string;
  dot: string;
  preview: string;
  gradient?: "linear" | "radial";
}

export const SWATCHES: Swatch[] = [
  {
    id: "ink",
    label: "Ink",
    fg: () => INK,
    eye: INK,
    dot: ACCENT,
    preview: INK,
  },
  {
    id: "graphite",
    label: "Graphite",
    fg: () => "#3f3f46",
    eye: "#3f3f46",
    dot: "#3f3f46",
    preview: "#3f3f46",
  },
  {
    id: "blue",
    label: "Blue",
    fg: () => ACCENT,
    eye: "#0b3aa8",
    dot: "#0b3aa8",
    preview: ACCENT,
  },
  {
    id: "forest",
    label: "Forest",
    fg: () => "#14532d",
    eye: "#14532d",
    dot: "#14532d",
    preview: "#14532d",
  },
  {
    id: "ink-blue",
    label: "Ink to blue",
    fg: (angle) => ({
      type: "linear",
      angle,
      stops: [
        { color: INK, offset: 0 },
        { color: ACCENT, offset: 100 },
      ],
    }),
    eye: INK,
    dot: ACCENT,
    preview: `linear-gradient(135deg,${INK},${ACCENT})`,
    gradient: "linear",
  },
  {
    id: "midnight",
    label: "Midnight",
    fg: () => ({
      type: "radial",
      stops: [
        { color: "#1e3a8a", offset: 0 },
        { color: INK, offset: 100 },
      ],
    }),
    eye: INK,
    dot: "#1e3a8a",
    preview: `radial-gradient(circle,#1e3a8a,${INK})`,
    gradient: "radial",
  },
];

export const ANGLES = [
  { value: "0", label: "0°" },
  { value: "45", label: "45°" },
  { value: "90", label: "90°" },
  { value: "135", label: "135°" },
] as const;

// A curated few per tab, so the card stays calm; the playground has them all.
export const SHOWN_BODIES: BodyPattern[] = (
  [
    "rounded",
    "square",
    "circle",
    "classy-rounded",
    "liquid",
    "leaf",
    "heart",
    "mosaic",
  ] as const
).filter((item) => BODY_PATTERN.includes(item));

export const SHOWN_EYES: CornerEyePattern[] = (
  ["squircle", "extra-rounded", "rounded", "square", "leaf", "gear"] as const
).filter((item) => CORNER_EYE_PATTERNS.includes(item));

export const SHOWN_FRAMES: FrameStyle[] = (
  [
    "none",
    "banner-bottom",
    "rounded-border",
    "speech-bubble",
    "polaroid",
    "ticket",
  ] as const
).filter((item) => FRAME_STYLES.includes(item));

/** The look the studio opens on (lib/landing/showcase-styles.ts). */
const START = SHOWCASE_STYLES[SHOWCASE_PLACEMENTS["home.studio"]];

const MORE_LABEL = `All ${PRODUCT_FACTS.bodyPatterns} patterns, ${PRODUCT_FACTS.eyeShapes} eyes and ${PRODUCT_FACTS.frames} frames in the playground`;

export interface StudioPicks {
  body: BodyPattern;
  eye: CornerEyePattern;
  swatch: Swatch;
  angle: string;
  frameStyle: FrameStyle;
  frameText: string;
}

/**
 * What the studio draws, as an editor design: its showcase style with the
 * picks on top. The preview draws it, and its link opens it in the playground.
 */
export function studioLook({
  body,
  eye,
  swatch,
  angle,
  frameStyle,
  frameText,
}: StudioPicks) {
  return {
    ...showcaseThemeStyles(SHOWCASE_PLACEMENTS["home.studio"]),
    fgColor: swatch.fg(Number(angle)),
    eyeColor: swatch.eye,
    dotColor: swatch.dot,
    bodyPattern: body,
    cornerEyePattern: eye,
    frame:
      frameStyle === "none"
        ? undefined
        : ({ style: frameStyle, text: frameText, color: INK } as const),
  } satisfies QRStyle;
}

/**
 * The playground with the studio's look. Packed without the validator, which
 * would grow this demo's script; the playground validates every link, and
 * tests/home/marketing-playground-links.test.ts decodes every pick.
 */
export const studioPlaygroundHref = (look: QRStyle): string =>
  playgroundHref({ style: packStyleParam(look) });

/** Patterns / colors / frames playground in miniature, using the real renderer. */
export function StudioDemo() {
  const reduce = useReducedMotion();
  const textId = useId();
  const [tab, setTab] = useState<Tab>("patterns");
  const [body, setBody] = useState<BodyPattern>(START.bodyPattern);
  const [eye, setEye] = useState<CornerEyePattern>(START.cornerEyePattern);
  const [swatchId, setSwatchId] = useState("ink");
  const [angle, setAngle] = useState<(typeof ANGLES)[number]["value"]>("45");
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("banner-bottom");
  const [frameText, setFrameText] = useState("Scan me");

  const swatch = SWATCHES.find((item) => item.id === swatchId) ?? SWATCHES[0];
  const styleKey = `${body}-${eye}-${swatch.id}-${angle}-${frameStyle}`;
  const look = studioLook({ body, eye, swatch, angle, frameStyle, frameText });

  return (
    // Beside the row's text (lg) the card is narrower, so the preview gives up width.
    <div className="grid h-full md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
      <div className="flex min-w-0 flex-col gap-4 p-5 md:p-6">
        <SegmentedControl
          label="Customize"
          options={TABS}
          value={tab}
          onChange={setTab}
          size="sm"
          className="w-fit"
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className="flex min-h-48 flex-col gap-4"
          >
            {tab === "patterns" && (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2">
                    <Readout>body</Readout>
                  </legend>
                  <div className="flex flex-wrap gap-1">
                    {SHOWN_BODIES.map((item) => (
                      <Chip
                        key={item}
                        selected={body === item}
                        onClick={() => setBody(item)}
                      >
                        {humanize(item)}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2">
                    <Readout>corner eyes</Readout>
                  </legend>
                  <div className="flex flex-wrap gap-1">
                    {SHOWN_EYES.map((item) => (
                      <Chip
                        key={item}
                        selected={eye === item}
                        onClick={() => setEye(item)}
                      >
                        {humanize(item)}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {tab === "colors" && (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2">
                    <Readout>color · {swatch.label.toLowerCase()}</Readout>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {SWATCHES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={swatchId === item.id}
                        aria-label={item.label}
                        title={item.label}
                        onClick={() => setSwatchId(item.id)}
                        className={cn(
                          "grid size-9 place-items-center rounded-full ring-1 ring-border transition-[box-shadow,transform] duration-150 hover:ring-foreground/30 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          swatchId === item.id && "ring-2 ring-foreground",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="size-6 rounded-full"
                          style={{ background: item.preview }}
                        />
                      </button>
                    ))}
                  </div>
                </fieldset>
                {swatch.gradient === "linear" ? (
                  <div className="flex flex-col gap-2">
                    <Readout>gradient angle</Readout>
                    <SegmentedControl
                      label="Gradient angle"
                      options={ANGLES}
                      value={angle}
                      onChange={setAngle}
                      size="sm"
                      className="w-fit"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {swatch.gradient === "radial"
                      ? "Radial gradients spread from the center."
                      : "Solid colors, or pick a gradient to set its angle."}
                  </p>
                )}
              </>
            )}
            {tab === "frames" && (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2">
                    <Readout>frame</Readout>
                  </legend>
                  <div className="flex flex-wrap gap-1">
                    {SHOWN_FRAMES.map((item) => (
                      <Chip
                        key={item}
                        selected={frameStyle === item}
                        onClick={() => setFrameStyle(item)}
                      >
                        {humanize(item)}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
                <div className="flex max-w-xs flex-col gap-2">
                  <Label htmlFor={textId} className="text-xs">
                    Call to action
                  </Label>
                  <Input
                    id={textId}
                    value={frameText}
                    maxLength={FRAME_TEXT_MAX_LENGTH}
                    disabled={frameStyle === "none"}
                    onChange={(event) => setFrameText(event.target.value)}
                  />
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <Link
          className="mt-auto inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          href={studioPlaygroundHref(look)}
        >
          {MORE_LABEL}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
      <DemoStage className="flex items-center justify-center border-t bg-muted/30 p-6 md:border-t-0 md:border-l">
        <motion.div
          key={styleKey}
          initial={reduce ? false : { opacity: 0.55, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.base, ease: EASE }}
          className="w-full max-w-48"
        >
          <QrTile
            label="Live preview of the QR code with the chosen style"
            className={cn(
              "w-full",
              // Framed codes are taller than wide: let the tile follow them.
              frameStyle !== "none" && "aspect-auto [&_svg]:h-auto",
            )}
          >
            <QRCodeSVG
              {...HOME_CODES.studio}
              fgColor={look.fgColor}
              eyeColor={look.eyeColor}
              dotColor={look.dotColor}
              bodyPattern={look.bodyPattern}
              cornerEyePattern={look.cornerEyePattern}
              frame={look.frame}
            />
          </QrTile>
        </motion.div>
      </DemoStage>
    </div>
  );
}
