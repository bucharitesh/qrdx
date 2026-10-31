"use client";

import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, Scan, TickCircle } from "iconsax-reactjs";
import { useTheme } from "next-themes";
import {
  type ColorConfig,
  loadQRArtImage,
  type QRArt,
  QRCode,
  QRCodeSVG,
} from "qrdx";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  HintVisual as HintVisualSpec,
  LiveExample,
} from "@/lib/help/hints";

// ─── Shared bits ────────────────────────────────────────────────────────────

const INK = "#0a0a0a";
const PAPER = "#ffffff";
const SAMPLE_URL = "https://qrdx.dev/q/aB3dE5f";
const LOGO = "/logo.png";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => true,
  );
}

const CYCLE_COUNTS = [2, 3, 4];

/** One keyframe per item count: each item shows for its slot, then crossfades. */
const KEYFRAMES = CYCLE_COUNTS.map((count) => {
  const slot = 100 / count;
  const fade = Math.min(6, slot / 5);
  return `@keyframes qrdx-hint-cycle-${count}{0%,${(slot - fade).toFixed(2)}%{opacity:1}${slot.toFixed(2)}%,${(100 - fade).toFixed(2)}%{opacity:0}100%{opacity:1}}`;
}).join("");

function cycleStyle(index: number, count: number, seconds: number) {
  return {
    animation: `qrdx-hint-cycle-${count} ${seconds}s ease-in-out infinite`,
    animationDelay: `${((index - count) * seconds) / count}s`,
  };
}

/**
 * Stacks its items and crossfades between them on a loop. With reduced
 * motion only `still` (default: the last item) is shown.
 */
function Cycle({
  items,
  seconds = 7.2,
  still,
  className,
}: {
  items: { key: string; node: ReactNode }[];
  seconds?: number;
  still?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const count = items.length;
  if (reduced || !CYCLE_COUNTS.includes(count)) {
    const item = items[still ?? count - 1];
    return <div className={className}>{item?.node}</div>;
  }
  return (
    <div className={cn("grid", className)}>
      {items.map((item, index) => (
        <div
          className="col-start-1 row-start-1"
          key={item.key}
          style={cycleStyle(index, count, seconds)}
        >
          {item.node}
        </div>
      ))}
    </div>
  );
}

/** White "paper" tile that holds a code, like a print. */
function Tile({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-[10px] bg-white p-2 shadow-xs ring-1 ring-black/5 [&_svg]:block",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Tag({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-px text-[10px] leading-4 font-medium whitespace-nowrap",
        ok
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-red-500/10 text-red-700 dark:text-red-400",
      )}
    >
      {children}
    </span>
  );
}

function Caption({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-muted-foreground text-[11px] leading-4 whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Sits a set of columns in the middle of the 16:10 visual. */
function Stage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center gap-4 p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Column({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-1.5">{children}</div>;
}

// WCAG contrast ratio between two #rrggbb colors.
function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

function ratioLabel(a: string, b: string) {
  const ratio = contrast(a, b);
  return `${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10}:1`;
}

// ─── Examples ───────────────────────────────────────────────────────────────

function StaticVsDynamic() {
  return (
    <Stage className="gap-6">
      <Column>
        <Tile>
          <QRCode
            bgColor={PAPER}
            fgColor={INK}
            level="M"
            margin={0}
            size={88}
            value="WIFI:T:WPA;S:Corner Cafe Guest;P:espresso-and-croissants-2026;;"
          />
        </Tile>
        <span className="text-[11px] leading-4 font-medium">Static</span>
        <Caption className="-mt-1.5">Wi-Fi details inside</Caption>
      </Column>
      <Column>
        <Tile>
          <QRCode
            bgColor={PAPER}
            fgColor={INK}
            level="M"
            margin={0}
            size={88}
            value={SAMPLE_URL}
          />
        </Tile>
        <span className="text-[11px] leading-4 font-medium">Dynamic</span>
        <Caption className="-mt-1.5">Short link, editable</Caption>
      </Column>
    </Stage>
  );
}

function UrlPill({ children }: { children: ReactNode }) {
  return (
    <span className="bg-background inline-flex h-7 max-w-full items-center rounded-full border px-2.5 font-mono text-[10.5px] whitespace-nowrap shadow-xs">
      {children}
    </span>
  );
}

function DestinationSwap() {
  return (
    <Stage className="gap-3">
      <Column>
        <Tile>
          <QRCode
            bgColor={PAPER}
            fgColor={INK}
            level="M"
            margin={0}
            size={84}
            value={SAMPLE_URL}
          />
        </Tile>
        <Caption>Printed once</Caption>
      </Column>
      <ArrowRight className="text-muted-foreground size-4 shrink-0" />
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <Caption>Opens</Caption>
        <Cycle
          items={[
            { key: "spring", node: <UrlPill>cafe.com/spring</UrlPill> },
            { key: "summer", node: <UrlPill>cafe.com/summer</UrlPill> },
          ]}
          seconds={5}
        />
        <Caption>Edit any time</Caption>
      </div>
    </Stage>
  );
}

const GRADIENT: ColorConfig = {
  type: "linear",
  angle: 45,
  stops: [
    { color: "#0a0a0a", offset: 0 },
    { color: "#155dfc", offset: 100 },
  ],
};

function ColorsContrast() {
  const pale = "#dedede";
  const samples: {
    key: string;
    fg: ColorConfig;
    caption: string;
    ok: boolean;
  }[] = [
    {
      key: "dark",
      fg: INK,
      caption: ratioLabel(INK, PAPER),
      ok: true,
    },
    {
      key: "gradient",
      fg: GRADIENT,
      caption: "Gradient",
      ok: true,
    },
    {
      key: "pale",
      fg: pale,
      caption: ratioLabel(pale, PAPER),
      ok: false,
    },
  ];
  return (
    <Stage>
      {samples.map((sample) => (
        <Column key={sample.key}>
          <Tile>
            <QRCode
              bgColor={PAPER}
              eyeColor={sample.fg}
              fgColor={sample.fg}
              level="M"
              margin={0}
              size={64}
              value={SAMPLE_URL}
            />
          </Tile>
          <Caption>{sample.caption}</Caption>
          <Tag ok={sample.ok}>{sample.ok ? "Scans" : "Won't scan"}</Tag>
        </Column>
      ))}
    </Stage>
  );
}

interface CodeVariant {
  key: string;
  name: string;
  props: Partial<ComponentProps<typeof QRCode>>;
}

function CyclingCode({
  variants,
  size = 104,
}: {
  variants: CodeVariant[];
  size?: number;
}) {
  return (
    <Stage className="flex-col gap-2">
      <Tile>
        <Cycle
          items={variants.map((variant) => ({
            key: variant.key,
            node: (
              <QRCode
                bgColor={PAPER}
                fgColor={INK}
                level="M"
                margin={0}
                size={size}
                value={SAMPLE_URL}
                {...variant.props}
              />
            ),
          }))}
          still={0}
        />
      </Tile>
      <Cycle
        className="justify-items-center"
        items={variants.map((variant) => ({
          key: variant.key,
          node: <Caption>{variant.name}</Caption>,
        }))}
        still={0}
      />
    </Stage>
  );
}

// Square eyes, so only the dots change.
const DOT_VARIANTS: CodeVariant[] = (
  [
    ["square", "Square"],
    ["circle", "Circle"],
    ["diamond", "Diamond"],
    ["vertical-line", "Vertical line"],
  ] as const
).map(([bodyPattern, name]) => ({
  key: bodyPattern,
  name,
  props: {
    bodyPattern,
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
  },
}));

// Square dots, so only the eyes change. Circle and curly eyes are left out:
// the scan score flags them for some decoders.
const EYE_VARIANTS: CodeVariant[] = (
  [
    ["square", "square", "Square"],
    ["rounded", "rounded", "Rounded"],
    ["gear", "circle", "Gear"],
  ] as const
).map(([cornerEyePattern, cornerEyeDotPattern, name]) => ({
  key: cornerEyePattern,
  name,
  props: { bodyPattern: "square", cornerEyePattern, cornerEyeDotPattern },
}));

function DotShapes() {
  return <CyclingCode variants={DOT_VARIANTS} />;
}

function EyeShapes() {
  return <CyclingCode variants={EYE_VARIANTS} />;
}

function LogoBeforeAfter() {
  return (
    <Stage className="gap-6">
      <Column>
        <Tile>
          <QRCode
            bgColor={PAPER}
            fgColor={INK}
            hideLogo
            level="M"
            margin={0}
            size={92}
            value={SAMPLE_URL}
          />
        </Tile>
        <Caption>No logo · level M</Caption>
      </Column>
      <Column>
        <Tile>
          <QRCode
            bgColor={PAPER}
            fgColor={INK}
            level="H"
            logo={LOGO}
            margin={0}
            size={92}
            value={SAMPLE_URL}
          />
        </Tile>
        <Caption>With logo · level H</Caption>
      </Column>
    </Stage>
  );
}

function Frames() {
  const frames = [
    { key: "banner-bottom", name: "Banner" },
    { key: "rounded-border", name: "Rounded border" },
    { key: "speech-bubble", name: "Speech bubble" },
  ] as const;
  return (
    <Stage className="flex-col gap-2">
      <Cycle
        className="place-items-center"
        items={frames.map((frame) => ({
          key: frame.key,
          node: (
            <div className="grid h-[8.25rem] place-items-center [&_svg]:h-full [&_svg]:w-auto">
              <QRCode
                bgColor={PAPER}
                fgColor={INK}
                frame={{
                  style: frame.key,
                  text: "Scan me",
                  color: INK,
                  textColor: PAPER,
                }}
                level="M"
                margin={1}
                size={120}
                value={SAMPLE_URL}
              />
            </div>
          ),
        }))}
        still={0}
      />
      <Cycle
        className="justify-items-center"
        items={frames.map((frame) => ({
          key: frame.key,
          node: <Caption>{frame.name}</Caption>,
        }))}
        still={0}
      />
    </Stage>
  );
}

function QuietZone() {
  return (
    // A busy, dark print background, where a missing border hurts most.
    <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,#3f3f46_0_5px,#27272a_5px_10px)]">
      <Stage className="gap-6">
        <Column>
          <div className="grid size-[100px] place-items-center [&_svg]:block">
            <QRCode
              bgColor={PAPER}
              fgColor={INK}
              level="M"
              margin={0}
              size={80}
              value={SAMPLE_URL}
            />
          </div>
          <span className="rounded-full bg-black/75 px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap text-white">
            No border
          </span>
        </Column>
        <Column>
          <div className="[&_svg]:block">
            <QRCode
              bgColor={PAPER}
              fgColor={INK}
              level="M"
              margin={4}
              size={100}
              value={SAMPLE_URL}
            />
          </div>
          <span className="rounded-full bg-black/75 px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap text-white">
            4 modules
          </span>
        </Column>
      </Stage>
    </div>
  );
}

const ART_SOURCES = {
  logo: "/images/art-samples/logos/bloom.svg",
  halftone: "/images/art-samples/photos/flowers.webp",
} as const;

function useArt(mode: keyof typeof ART_SOURCES): QRArt | null {
  const [art, setArt] = useState<QRArt | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadQRArtImage(ART_SOURCES[mode], { mode })
      .then((image) => {
        if (!cancelled) setArt({ mode, image });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mode]);
  return art;
}

function ArtModes() {
  const logoArt = useArt("logo");
  const imageArt = useArt("halftone");
  const samples = [
    { key: "classic", name: "Classic", art: undefined, ready: true },
    { key: "logo", name: "Logo QR", art: logoArt, ready: Boolean(logoArt) },
    { key: "image", name: "Image QR", art: imageArt, ready: Boolean(imageArt) },
  ];
  return (
    <Stage className="gap-3">
      {samples.map((sample) => (
        <Column key={sample.key}>
          <Tile className="size-[84px] p-1.5">
            {sample.ready ? (
              <QRCode
                art={sample.art ?? undefined}
                bgColor={PAPER}
                fgColor={INK}
                level="H"
                margin={0}
                size={72}
                value={SAMPLE_URL}
              />
            ) : (
              <span className="bg-muted size-[72px] animate-pulse rounded-sm" />
            )}
          </Tile>
          <Caption>{sample.name}</Caption>
        </Column>
      ))}
    </Stage>
  );
}

const LEVELS = [
  { id: "L", name: "Low", recovery: "7%" },
  { id: "M", name: "Medium", recovery: "15%" },
  { id: "Q", name: "Quartile", recovery: "25%" },
  { id: "H", name: "High", recovery: "30%" },
] as const;

function ErrorLevels() {
  const reduced = useReducedMotion();
  const seconds = 8;
  return (
    <Stage className="gap-5">
      <Column>
        <Tile>
          <Cycle
            items={LEVELS.map((level) => ({
              key: level.id,
              node: (
                <QRCode
                  bgColor={PAPER}
                  fgColor={INK}
                  level={level.id}
                  logo={LOGO}
                  margin={0}
                  size={108}
                  value="https://qrdx.dev/playground"
                />
              ),
            }))}
            seconds={seconds}
          />
        </Tile>
      </Column>
      <ul className="flex flex-col gap-0.5">
        {LEVELS.map((level, index) => (
          <li className="relative" key={level.id}>
            <span
              aria-hidden
              className="bg-foreground/[0.07] ring-foreground/10 absolute inset-0 rounded-md ring-1"
              style={
                reduced
                  ? { opacity: level.id === "H" ? 1 : 0 }
                  : cycleStyle(index, LEVELS.length, seconds)
              }
            />
            <span className="relative flex items-baseline gap-2 px-2 py-1 text-[11px] leading-4">
              <span className="w-3 font-semibold">{level.id}</span>
              <span className="text-muted-foreground w-12">{level.name}</span>
              <span className="tabular-nums">{level.recovery}</span>
            </span>
          </li>
        ))}
      </ul>
    </Stage>
  );
}

const GRADES = [
  { id: "great", label: "Great", range: "85–100", color: "bg-emerald-500" },
  { id: "ok", label: "OK", range: "65–84", color: "bg-amber-400" },
  { id: "risky", label: "Risky", range: "0–64", color: "bg-orange-500" },
  { id: "fails", label: "Fails", range: "won't read", color: "bg-red-500" },
] as const;

function ScanGrades() {
  return (
    <Stage className="flex-col gap-3">
      <span className="bg-background inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium shadow-sm">
        <span className="size-2 rounded-full bg-emerald-500" />
        Scan score 92 · Great
      </span>
      <ul className="grid w-full max-w-60 grid-cols-2 gap-x-4 gap-y-1">
        {GRADES.map((grade) => (
          <li
            className="flex items-center gap-1.5 text-[11px] leading-4"
            key={grade.id}
          >
            <span
              className={cn("size-1.5 shrink-0 rounded-full", grade.color)}
            />
            <span className="font-medium">{grade.label}</span>
            <span className="text-muted-foreground ml-auto tabular-nums">
              {grade.range}
            </span>
          </li>
        ))}
      </ul>
    </Stage>
  );
}

/** Draws the code into a tiny canvas, then shows it blown up: the PNG look. */
function PixelatedCode({ size }: { size: number }) {
  const svgRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const svg = svgRef.current?.querySelector("svg");
    const canvas = canvasRef.current;
    if (!(svg && canvas)) return;
    const markup = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  }, []);
  return (
    <>
      <div aria-hidden className="hidden" ref={svgRef}>
        <ZoomCode size={size} />
      </div>
      <canvas
        className="block [image-rendering:pixelated]"
        height={46}
        ref={canvasRef}
        style={{ width: size, height: size }}
        width={46}
      />
    </>
  );
}

function ZoomCode({ size }: { size: number }) {
  return (
    <QRCodeSVG
      bgColor={PAPER}
      bodyPattern="circle"
      cornerEyeDotPattern="circle"
      cornerEyePattern="rounded"
      fgColor={INK}
      level="M"
      margin={0}
      size={size}
      value={SAMPLE_URL}
    />
  );
}

function DownloadFormats() {
  const reduced = useReducedMotion();
  const size = 300;
  const zoom = reduced
    ? undefined
    : { animation: "qrdx-hint-zoom 6s ease-in-out infinite alternate" };
  const panes = [
    { key: "png", title: "PNG · JPG", note: "Pixels", vector: false },
    { key: "svg", title: "SVG · PDF · EPS", note: "Vector", vector: true },
  ];
  return (
    <Stage className="gap-3">
      {panes.map((pane) => (
        <Column key={pane.key}>
          <div className="relative size-[104px] overflow-hidden rounded-[10px] bg-white ring-1 ring-black/5">
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{ ...zoom, transform: reduced ? "scale(1)" : undefined }}
            >
              {pane.vector ? (
                <div className="[&_svg]:block">
                  <ZoomCode size={size} />
                </div>
              ) : (
                <PixelatedCode size={size} />
              )}
            </div>
          </div>
          <span className="text-[11px] leading-4 font-medium">
            {pane.title}
          </span>
          <Caption className="-mt-1.5">{pane.note}</Caption>
        </Column>
      ))}
    </Stage>
  );
}

// Short lines just outside the bleed, in line with the trim edges.
const CROP_MARKS = [
  "top-0 left-4 h-2 w-px",
  "top-4 left-0 h-px w-2",
  "top-0 right-4 h-2 w-px",
  "top-4 right-0 h-px w-2",
  "bottom-0 left-4 h-2 w-px",
  "bottom-4 left-0 h-px w-2",
  "right-4 bottom-0 h-2 w-px",
  "right-0 bottom-4 h-px w-2",
];

function PrintBleed() {
  return (
    <Stage className="gap-5">
      <div aria-hidden className="relative size-[8.5rem] shrink-0">
        {CROP_MARKS.map((mark) => (
          <span className={cn("bg-foreground/60 absolute", mark)} key={mark} />
        ))}
        <span className="bg-foreground/15 absolute inset-2.5 rounded-[2px]" />
        <span className="border-foreground/50 absolute inset-4 grid place-items-center border border-dashed bg-white [&_svg]:block">
          <QRCode
            bgColor={PAPER}
            fgColor={INK}
            level="M"
            margin={0}
            size={60}
            value={SAMPLE_URL}
          />
        </span>
      </div>
      <ul className="flex flex-col gap-2 text-[11px] leading-4">
        <li className="flex items-center gap-2">
          <span className="border-foreground/50 size-3 shrink-0 border border-dashed bg-white" />
          Trim line
        </li>
        <li className="flex items-center gap-2">
          <span className="bg-foreground/15 size-3 shrink-0 rounded-[2px]" />
          <span>3 mm bleed</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="relative size-3 shrink-0">
            <span className="bg-foreground/60 absolute top-0 left-1.5 h-1.5 w-px" />
            <span className="bg-foreground/60 absolute top-1.5 left-0 h-px w-1.5" />
          </span>
          Crop marks
        </li>
      </ul>
    </Stage>
  );
}

const SHARED_STYLE = {
  bgColor: PAPER,
  fgColor: INK,
  eyeColor: "#155dfc",
  dotColor: INK,
  bodyPattern: "circle",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "circle",
} as const;

function ShareStyle() {
  return (
    <Stage className="gap-3">
      <Column>
        <Tile>
          <QRCode
            {...SHARED_STYLE}
            level="M"
            margin={0}
            size={80}
            value="https://yourcafe.com/menu"
          />
        </Tile>
        <Caption>Your link</Caption>
      </Column>
      <div className="flex flex-col items-center gap-1">
        <span className="bg-background text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] leading-4 whitespace-nowrap">
          Style
        </span>
        <ArrowRight className="text-muted-foreground size-4" />
      </div>
      <Column>
        <Tile>
          <QRCode
            {...SHARED_STYLE}
            level="M"
            margin={0}
            size={80}
            value="https://example.org/tickets"
          />
        </Tile>
        <Caption>Their link</Caption>
      </Column>
    </Stage>
  );
}

function ReactComponent() {
  return (
    <Stage className="gap-3">
      <pre className="bg-background text-foreground/90 rounded-lg border px-2.5 py-2 font-mono text-[10px] leading-[1.6] shadow-xs">
        <span className="text-muted-foreground">{"<"}</span>QRCode
        {"\n  "}
        <span className="text-muted-foreground">value=</span>
        {'"acme.com"'}
        {"\n  "}
        <span className="text-muted-foreground">bodyPattern=</span>
        {'"circle"'}
        {"\n  "}
        <span className="text-muted-foreground">eyeColor=</span>
        {'"#155dfc"'}
        {"\n"}
        <span className="text-muted-foreground">{"/>"}</span>
      </pre>
      <Tile className="shrink-0">
        <QRCode
          {...SHARED_STYLE}
          level="M"
          margin={0}
          size={76}
          value="acme.com"
        />
      </Tile>
    </Stage>
  );
}

function PrintDistance() {
  const sizes = [
    { key: "card", distance: "20 cm", width: "2 cm", px: 30 },
    { key: "poster", distance: "1 m", width: "10 cm", px: 58 },
    { key: "sign", distance: "3 m", width: "30 cm", px: 96 },
  ];
  return (
    <Stage className="items-end gap-5 pb-5">
      {sizes.map((item) => (
        <Column key={item.key}>
          <div className="rounded-[4px] bg-white p-[3px] shadow-xs ring-1 ring-black/5 [&_svg]:block">
            <QRCode
              bgColor={PAPER}
              fgColor={INK}
              level="M"
              margin={0}
              size={item.px}
              value={SAMPLE_URL}
            />
          </div>
          <span className="text-[11px] leading-4 font-medium tabular-nums">
            {item.width}
          </span>
          <Caption className="-mt-1.5 tabular-nums">
            from {item.distance}
          </Caption>
        </Column>
      ))}
    </Stage>
  );
}

function CustomDomain() {
  const links = [
    { key: "default", host: "qrdx.dev/q/", value: SAMPLE_URL },
    {
      key: "custom",
      host: "go.yourbrand.com/",
      value: "https://go.yourbrand.com/aB3dE5f",
    },
  ];
  return (
    <Stage className="flex-col gap-2.5">
      <Tile>
        <Cycle
          items={links.map((link) => ({
            key: link.key,
            node: (
              <QRCode
                bgColor={PAPER}
                fgColor={INK}
                level="M"
                margin={0}
                size={84}
                value={link.value}
              />
            ),
          }))}
          seconds={6}
        />
      </Tile>
      <Cycle
        className="justify-items-center"
        items={links.map((link) => ({
          key: link.key,
          node: (
            <UrlPill>
              <span
                className={cn(
                  link.key === "custom"
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground",
                )}
              >
                {link.host}
              </span>
              aB3dE5f
            </UrlPill>
          ),
        }))}
        seconds={6}
      />
    </Stage>
  );
}

function WebhookPayload() {
  const key = (text: string) => (
    <span className="text-muted-foreground">&quot;{text}&quot;</span>
  );
  return (
    <Stage className="gap-2.5">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="bg-background grid size-9 place-items-center rounded-full border shadow-xs">
          <Scan className="size-4" />
        </span>
        <Caption>Scan</Caption>
      </div>
      <ArrowRight className="text-muted-foreground size-4 shrink-0" />
      <pre className="bg-background min-w-0 rounded-lg border px-2.5 py-2 font-mono text-[9.5px] leading-[1.55] shadow-xs">
        <span className="text-muted-foreground">POST</span> your-app.com/hook
        {"\n{\n  "}
        {key("type")}: &quot;scan.created&quot;,{"\n  "}
        {key("data")}: {"{\n    "}
        {key("count")}: 2,{"\n    "}
        {key("scans")}: [ … ]{"\n  }\n}"}
      </pre>
    </Stage>
  );
}

function UtmUrl() {
  const params = [
    ["utm_source", "qr"],
    ["utm_medium", "print"],
    ["utm_campaign", "spring-sale"],
  ] as const;
  return (
    <Stage className="flex-col gap-3">
      <div className="bg-background rounded-lg border px-3 py-2 font-mono text-[10.5px] leading-[1.65] shadow-xs">
        <p>yourcafe.com/menu</p>
        {params.map(([name, value], index) => (
          <p className="pl-3" key={name}>
            <span className="text-muted-foreground">{index ? "&" : "?"}</span>
            <span className="bg-foreground/[0.07] rounded-[3px] px-0.5">
              {name}={value}
            </span>
          </p>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] leading-4">
        <TickCircle
          className="size-3.5 text-emerald-600 dark:text-emerald-400"
          variant="Bold"
        />
        <span className="text-muted-foreground">Analytics shows</span>
        <span className="font-medium">qr / print</span>
      </div>
    </Stage>
  );
}

const WEEK = [38, 52, 44, 71, 64, 90, 77];

function ScanAnalytics() {
  const max = Math.max(...WEEK);
  return (
    <Stage className="flex-col items-stretch gap-2 px-5">
      <div className="flex items-end justify-between">
        <div className="flex gap-4">
          <div>
            <p className="text-muted-foreground text-[10px] leading-4">Scans</p>
            <p className="text-sm leading-5 font-semibold tabular-nums">436</p>
          </div>
          <div>
            <p className="text-muted-foreground text-[10px] leading-4">
              Unique visitors
            </p>
            <p className="text-sm leading-5 font-semibold tabular-nums">318</p>
          </div>
        </div>
        <Caption>Example week</Caption>
      </div>
      <div className="flex h-20 items-end gap-1.5">
        {WEEK.map((value, index) => (
          <span
            className="bg-foreground/70 flex-1 rounded-t-[3px]"
            key={index}
            style={{ height: `${(value / max) * 100}%` }}
          />
        ))}
      </div>
    </Stage>
  );
}

const LIVE: Record<LiveExample, () => ReactNode> = {
  "art-modes": ArtModes,
  "colors-contrast": ColorsContrast,
  "custom-domain": CustomDomain,
  "destination-swap": DestinationSwap,
  "dot-shapes": DotShapes,
  "download-formats": DownloadFormats,
  "error-levels": ErrorLevels,
  "eye-shapes": EyeShapes,
  frames: Frames,
  "logo-before-after": LogoBeforeAfter,
  "print-bleed": PrintBleed,
  "print-distance": PrintDistance,
  "quiet-zone": QuietZone,
  "react-component": ReactComponent,
  "scan-analytics": ScanAnalytics,
  "scan-grades": ScanGrades,
  "share-style": ShareStyle,
  "static-vs-dynamic": StaticVsDynamic,
  "utm-url": UtmUrl,
  "webhook-payload": WebhookPayload,
};

// ─── Video and image ────────────────────────────────────────────────────────

function HintVideo({ name, label }: { name: string; label: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const poster = `/images/help/${name}.webp`;

  // Mounted only while the card is open: start loading and playing now.
  useEffect(() => {
    const video = ref.current;
    if (!video || reduced) return;
    video.muted = true;
    video.preload = "auto";
    video.play().catch(() => undefined);
  }, [reduced]);

  if (reduced) {
    return (
      <img
        alt={label}
        className="absolute inset-0 size-full object-cover"
        decoding="async"
        src={poster}
      />
    );
  }
  return (
    <video
      aria-label={label}
      className="absolute inset-0 size-full object-cover"
      loop
      muted
      playsInline
      poster={poster}
      preload="none"
      ref={ref}
    >
      <source src={`/videos/help/${name}.webm`} type="video/webm" />
      <source src={`/videos/help/${name}.mp4`} type="video/mp4" />
    </video>
  );
}

function HintImage({
  src,
  darkSrc,
  label,
}: {
  src: string;
  darkSrc?: string;
  label: string;
}) {
  const { resolvedTheme } = useTheme();
  return (
    <img
      alt={label}
      className="absolute inset-0 size-full object-cover"
      decoding="async"
      src={resolvedTheme === "dark" && darkSrc ? darkSrc : src}
    />
  );
}

export function HintVisual({ visual }: { visual: HintVisualSpec }) {
  if (visual.type === "video") {
    return <HintVideo label={visual.label} name={visual.name} />;
  }
  if (visual.type === "image") {
    return (
      <HintImage
        darkSrc={visual.darkSrc}
        label={visual.label}
        src={visual.src}
      />
    );
  }
  const Example = LIVE[visual.example];
  return (
    <div aria-label={visual.label} className="absolute inset-0" role="img">
      <style href="qrdx-hint-keyframes" precedence="default">
        {`${KEYFRAMES}@keyframes qrdx-hint-zoom{0%,15%{transform:scale(.35)}85%,100%{transform:scale(1)}}`}
      </style>
      <Example />
    </div>
  );
}
