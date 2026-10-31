"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCode } from "qrdx";
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
import { useState } from "react";
import { DURATION, EASE } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import { Chip, humanize, QrTile } from "./demo-ui";

type Tab = "patterns" | "colors" | "frames";

const TABS = [
  { value: "patterns", label: "Patterns" },
  { value: "colors", label: "Colors" },
  { value: "frames", label: "Frames" },
] as const;

interface Swatch {
  id: string;
  label: string;
  fg: (angle: number) => ColorConfig;
  eye: string;
  preview: string;
  gradient?: "linear" | "radial";
}

const SWATCHES: Swatch[] = [
  {
    id: "navy",
    label: "Navy",
    fg: () => "#0f172a",
    eye: "#155dfc",
    preview: "#0f172a",
  },
  {
    id: "emerald",
    label: "Emerald",
    fg: () => "#065f46",
    eye: "#065f46",
    preview: "#065f46",
  },
  {
    id: "blue-violet",
    label: "Blue to violet",
    fg: (angle) => ({
      type: "linear",
      angle,
      stops: [
        { color: "#155dfc", offset: 0 },
        { color: "#7c3aed", offset: 100 },
      ],
    }),
    eye: "#155dfc",
    preview: "linear-gradient(135deg,#155dfc,#7c3aed)",
    gradient: "linear",
  },
  {
    id: "sunset",
    label: "Sunset",
    fg: (angle) => ({
      type: "linear",
      angle,
      stops: [
        { color: "#ea580c", offset: 0 },
        { color: "#db2777", offset: 100 },
      ],
    }),
    eye: "#c2410c",
    preview: "linear-gradient(135deg,#ea580c,#db2777)",
    gradient: "linear",
  },
  {
    id: "radial",
    label: "Radial blue",
    fg: () => ({
      type: "radial",
      stops: [
        { color: "#155dfc", offset: 0 },
        { color: "#0f172a", offset: 100 },
      ],
    }),
    eye: "#0f172a",
    preview: "radial-gradient(circle,#155dfc,#0f172a)",
    gradient: "radial",
  },
];

const SHOWN_EYES: CornerEyePattern[] = CORNER_EYE_PATTERNS.filter((eye) =>
  ["square", "rounded", "extra-rounded", "circle", "gear", "pointy"].includes(
    eye,
  ),
);

/** Patterns / colors / frames playground in miniature, using the real renderer. */
export function StudioDemo() {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("patterns");
  const [body, setBody] = useState<BodyPattern>("rounded");
  const [eye, setEye] = useState<CornerEyePattern>("extra-rounded");
  const [swatchId, setSwatchId] = useState("blue-violet");
  const [angle, setAngle] = useState(45);
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("banner-bottom");
  const [frameText, setFrameText] = useState("Scan me");

  const swatch = SWATCHES.find((item) => item.id === swatchId) ?? SWATCHES[0];

  return (
    <div className="grid h-full gap-6 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
      <div className="flex min-w-0 flex-col gap-4">
        <SegmentedControl
          label="Customise"
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
            className="flex min-h-44 flex-col gap-4"
          >
            {tab === "patterns" && (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-xs font-medium text-muted-foreground">
                    Body pattern
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {BODY_PATTERN.map((item) => (
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
                  <legend className="mb-2 text-xs font-medium text-muted-foreground">
                    Corner eyes
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
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
                  <legend className="mb-2 text-xs font-medium text-muted-foreground">
                    Color
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {SWATCHES.map((item) => (
                      <Chip
                        key={item.id}
                        selected={swatchId === item.id}
                        onClick={() => setSwatchId(item.id)}
                      >
                        <span
                          aria-hidden="true"
                          className="size-3 rounded-full ring-1 ring-black/10"
                          style={{ background: item.preview }}
                        />
                        {item.label}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
                {swatch.gradient === "linear" ? (
                  <div className="flex max-w-xs flex-col gap-3">
                    <Label htmlFor="studio-angle" className="text-xs">
                      Gradient angle: {angle}°
                    </Label>
                    <Slider
                      id="studio-angle"
                      min={0}
                      max={360}
                      step={5}
                      value={[angle]}
                      onValueChange={([next]) => setAngle(next ?? 0)}
                      aria-label="Gradient angle"
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
                  <legend className="mb-2 text-xs font-medium text-muted-foreground">
                    Frame
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {FRAME_STYLES.map((item) => (
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
                  <Label htmlFor="studio-frame-text" className="text-xs">
                    Call to action
                  </Label>
                  <Input
                    id="studio-frame-text"
                    value={frameText}
                    maxLength={FRAME_TEXT_MAX_LENGTH}
                    disabled={frameStyle === "none"}
                    onChange={(event) => setFrameText(event.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <QrTile
        label="Live preview of the QR code with the chosen style"
        className="mx-auto w-full max-w-56"
      >
        <QRCode
          value="https://qrdx.dev"
          size={224}
          level="Q"
          hideLogo
          bgColor="#ffffff"
          fgColor={swatch.fg(angle)}
          eyeColor={swatch.eye}
          dotColor={swatch.eye}
          bodyPattern={body}
          cornerEyePattern={eye}
          cornerEyeDotPattern="rounded"
          frame={
            frameStyle === "none"
              ? undefined
              : { style: frameStyle, text: frameText, color: "#0f172a" }
          }
        />
      </QrTile>
    </div>
  );
}
