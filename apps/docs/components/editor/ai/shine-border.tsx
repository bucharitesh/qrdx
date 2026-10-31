import { cn } from "@repo/design-system/lib/utils";
import type * as React from "react";
import { AnimatedBot } from "./animated-bot";

// The AI accent: a hairline, low-saturation iridescent border (brand blue →
// violet → cyan) that turns slowly via an @property angle. No permanent
// glow: a soft bloom appears only on hover, keyboard focus or while active.
// Labels stay white (dark) or ink (light) with one light sweep every 6 s.
// Everything else animates opacity or background-position only. Reduced
// motion keeps a static border and no sweep.
const SHINE_CSS = `
@property --qx-angle { syntax: "<angle>"; inherits: true; initial-value: 0deg; }
@keyframes qx-turn { to { --qx-angle: 360deg; } }
@keyframes qx-sweep { 0%,78% { transform: translateX(-140%) skewX(-20deg); } 100% { transform: translateX(320%) skewX(-20deg); } }
@keyframes qx-gleam { 0%,70% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
@keyframes qx-glide { from { background-position: 92% 0; } to { background-position: 8% 0; } }
.qx-shine { --qx-ring: .7; --qx-bloom: 0; animation: qx-turn 10s linear infinite; }
.dark .qx-shine { --qx-ring: .6; }
.qx-shine[data-idle="true"] { --qx-ring: .5; }
.dark .qx-shine[data-idle="true"] { --qx-ring: .42; }
.group:hover > .qx-shine, .group:focus-visible > .qx-shine, .qx-shine[data-active="true"] { --qx-ring: .85; }
.dark .group:hover > .qx-shine, .dark .group:focus-visible > .qx-shine, .dark .qx-shine[data-active="true"] { --qx-ring: .72; }
.group:hover > .qx-shine, .group:focus-visible > .qx-shine, .group:focus-within .qx-shine.qx-focus-boost { --qx-bloom: .75; }
.qx-shine[data-active="true"] { --qx-bloom: .5; }
.group:hover > .qx-shine[data-active="true"] { --qx-bloom: .9; }
.qx-shine-paint { background: conic-gradient(from var(--qx-angle), #155dfc, #7c6cf6, #2fc4e8, #6d8dff, #9a86f8, #155dfc); }
.qx-ring { opacity: var(--qx-ring); transition: opacity .35s cubic-bezier(.32,.72,0,1); -webkit-mask: linear-gradient(#000 0 0) content-box xor, linear-gradient(#000 0 0); mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
.qx-bloom { opacity: var(--qx-bloom); transition: opacity .35s cubic-bezier(.32,.72,0,1); box-shadow: 0 6px 18px -8px rgba(21,93,252,.35), 0 0 14px -6px rgba(124,108,246,.3); }
.dark .qx-bloom { box-shadow: 0 8px 22px -8px rgba(21,93,252,.6), 0 0 18px -6px rgba(124,108,246,.5); }
.qx-sweep { animation: qx-sweep 6s cubic-bezier(.32,.72,0,1) infinite; }
.qx-gleam { --qx-gleam: #8b8b94; animation: qx-gleam 6s cubic-bezier(.32,.72,0,1) infinite; }
.dark .qx-gleam { --qx-gleam: #ffffff; }
.qx-glide { animation: qx-glide 3.6s cubic-bezier(.45,0,.55,1) infinite alternate; }
@media (prefers-reduced-motion: reduce) {
  .qx-shine, .qx-sweep, .qx-gleam, .qx-glide { animation: none !important; }
  .qx-sweep { opacity: 0 !important; }
  .qx-gleam { background-position: 150% 0 !important; }
  .qx-glide { background-position: 150% 0 !important; }
}
`;

/** Shared keyframes; React dedupes the tag by `href`. */
function ShineStyles() {
  return (
    <style href="qrdx-ai-shine" precedence="default">
      {SHINE_CSS}
    </style>
  );
}

/**
 * Opaque glass fill below the border: white with a soft drop in light mode,
 * dark glass with a faint top inner highlight in dark mode.
 */
const SURFACE_CLASS = cn(
  "absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,#ffffff,#fafafb)] shadow-[inset_0_1px_0_rgba(255,255,255,1),0_1px_2px_rgba(16,24,40,0.06)]",
  "dark:bg-[linear-gradient(180deg,#242428,#19191c)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.45)]",
);

/** Press feedback for small hosts like the send button (no hover lift). */
export const shinePressClass =
  "transition-transform duration-200 ease-out active:scale-[0.98] motion-reduce:transform-none";

interface ShineBorderProps {
  className?: string;
  /** Soft bloom under the host, shown only on hover, focus or while active. */
  glow?: boolean;
  /** Selected state (e.g. the open tab): brighter border and a steady bloom. */
  active?: boolean;
  /** Not selected: a quieter border so it never reads as the open tab. */
  idle?: boolean;
  /** Soft diagonal light sweep across the host every 6 s. */
  sweep?: boolean;
  /** Border width in px (1 reads as a hairline). */
  width?: number;
  /** Show the bloom while focus is inside the host (prompt boxes). */
  boostOnFocus?: boolean;
  /** Paint the opaque glass fill (for hosts without their own background). */
  surface?: boolean;
}

/**
 * The hairline iridescent border. Render it as the first child of a `group`
 * element with a border radius (and `relative isolate`, no background of its
 * own when `surface` is set); it follows the radius, ignores the pointer and
 * never changes layout or size.
 */
export function ShineBorder({
  className,
  glow,
  active,
  idle,
  sweep,
  width = 1,
  boostOnFocus,
  surface,
}: ShineBorderProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "qx-shine pointer-events-none absolute inset-0 -z-10 rounded-[inherit]",
        boostOnFocus && "qx-focus-boost",
        className,
      )}
      data-active={active ? "true" : undefined}
      data-idle={idle ? "true" : undefined}
    >
      <ShineStyles />
      {glow && <span className="qx-bloom absolute inset-0 rounded-[inherit]" />}
      {surface && <span className={SURFACE_CLASS} />}
      <span
        className="qx-shine-paint qx-ring absolute inset-0 rounded-[inherit]"
        style={{ padding: width }}
      />
      {sweep && (
        <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
          <span className="qx-sweep absolute inset-y-0 left-0 w-1/4 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent)]" />
        </span>
      )}
    </span>
  );
}

const GLEAM = {
  // A soft light sweep: white in dark mode, grey in light.
  light:
    "linear-gradient(100deg, currentColor 0%, currentColor 40%, var(--qx-gleam) 50%, currentColor 60%, currentColor 100%)",
  // The brand blue → violet → cyan passing through the letters.
  color:
    "linear-gradient(100deg, currentColor 0%, currentColor 34%, #155dfc 42%, #7c6cf6 50%, #2fc4e8 58%, currentColor 66%, currentColor 100%)",
} as const;

/**
 * Plain label (white in dark mode, ink in light) with a soft sweep across the
 * letters: by default a light pass every 6 s; with `tone="color"` the brand
 * colours glide slowly left and right, back and forth, without a pause.
 */
export function ShineText({
  children,
  className,
  tone = "light",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: keyof typeof GLEAM;
}) {
  return (
    <>
      <ShineStyles />
      <span
        className={cn(
          tone === "color" ? "qx-glide" : "qx-gleam",
          "bg-clip-text [-webkit-background-clip:text]",
          className,
        )}
        style={{
          backgroundImage: GLEAM[tone],
          backgroundSize: "250% 100%",
          WebkitTextFillColor: "transparent",
        }}
      >
        {children}
      </span>
    </>
  );
}

/** The AI generator's mark (kept for older imports). */
export function BotMark({
  className,
  thinking,
}: {
  className?: string;
  thinking?: boolean;
}) {
  return <AnimatedBot className={className} thinking={thinking} />;
}
