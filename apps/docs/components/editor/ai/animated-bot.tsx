import { cn } from "@repo/design-system/lib/utils";
import type { CSSProperties } from "react";

// Same drawing as `Bot` in @repo/design-system/components/icons, split into
// parts so they can move: eyes blink, the antenna light cycles colours, the
// head bobs; on hover (inside a `.group`) the eyes turn into happy arcs and
// the antenna sparks; `thinking` scans the eyes and speeds up the antenna.
// Only transform and opacity animate. Reduced motion keeps it still.
const BOT_CSS = `
@keyframes qx-bob { 0%,100% { transform: translateY(0) rotate(0deg); } 30% { transform: translateY(-.6px) rotate(-3deg); } 65% { transform: translateY(.3px) rotate(2deg); } }
@keyframes qx-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(.12); } }
@keyframes qx-scan { 0%,100% { transform: translateX(-1.1px); } 50% { transform: translateX(1.1px); } }
@keyframes qx-hue { 0%,18% { opacity: 1; } 25%,93% { opacity: 0; } 100% { opacity: 1; } }
@keyframes qx-halo { 0%,100% { opacity: .25; transform: scale(.8); } 50% { opacity: .7; transform: scale(1.25); } }
@keyframes qx-spark { 0% { opacity: 0; transform: translate(0,0) scale(.4); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(1); } }
.qx-bot { overflow: visible; }
.qx-bot .qx-head { transform-box: view-box; transform-origin: 12px 20px; animation: qx-bob 3.6s ease-in-out infinite; }
.qx-bot .qx-eye { transform-box: fill-box; transform-origin: center; animation: qx-blink 4.2s ease-in-out infinite; }
.qx-bot .qx-eye-r { animation-delay: .04s; }
.qx-bot .qx-eyes-happy { opacity: 0; transition: opacity .2s; }
.qx-bot .qx-eyes-open { transition: opacity .2s; }
.qx-bot .qx-hue { animation: qx-hue 4s linear infinite; }
.qx-bot .qx-hue:nth-child(2) { animation-delay: -3s; }
.qx-bot .qx-hue:nth-child(3) { animation-delay: -2s; }
.qx-bot .qx-hue:nth-child(4) { animation-delay: -1s; }
.qx-bot .qx-halo { transform-box: fill-box; transform-origin: center; animation: qx-halo 2s ease-in-out infinite; }
.qx-bot .qx-spark { opacity: 0; transform-box: fill-box; transform-origin: center; }
.group:hover .qx-bot .qx-eyes-open, .qx-bot.qx-happy .qx-eyes-open { opacity: 0; }
.group:hover .qx-bot .qx-eyes-happy, .qx-bot.qx-happy .qx-eyes-happy { opacity: 1; }
.group:hover .qx-bot .qx-spark { animation: qx-spark .9s ease-out infinite; }
.group:hover .qx-bot .qx-spark:nth-child(2) { animation-delay: .3s; }
.group:hover .qx-bot .qx-spark:nth-child(3) { animation-delay: .6s; }
.qx-bot.qx-thinking .qx-eyes-open { animation: qx-scan 1.1s ease-in-out infinite; }
.qx-bot.qx-thinking .qx-hue { animation-duration: 1.4s; }
.qx-bot.qx-thinking .qx-hue:nth-child(2) { animation-delay: -1.05s; }
.qx-bot.qx-thinking .qx-hue:nth-child(3) { animation-delay: -.7s; }
.qx-bot.qx-thinking .qx-hue:nth-child(4) { animation-delay: -.35s; }
.qx-bot.qx-thinking .qx-halo { animation-duration: .8s; }
@media (prefers-reduced-motion: reduce) {
  .qx-bot *, .group:hover .qx-bot * { animation: none !important; }
  .qx-bot .qx-hue:not(:first-child), .qx-bot .qx-spark { opacity: 0 !important; }
}
`;

// The antenna light cycles the same calm iridescent set as the AI border.
const HUES = ["#6d8dff", "#9a86f8", "#2fc4e8", "#155dfc"];
const SPARKS = [
  { cx: 12, cy: 1.2, sx: "-3px", sy: "-2.5px" },
  { cx: 12, cy: 1.2, sx: "0px", sy: "-3.5px" },
  { cx: 12, cy: 1.2, sx: "3px", sy: "-2.5px" },
];

export function AnimatedBot({
  className,
  thinking = false,
  happy = false,
  title,
}: {
  className?: string;
  /** Eyes scan and the antenna pulses faster (a generation is running). */
  thinking?: boolean;
  /** Force the happy eyes (otherwise they show on `.group` hover). */
  happy?: boolean;
  title?: string;
}) {
  return (
    <>
      <style href="qrdx-animated-bot" precedence="default">
        {BOT_CSS}
      </style>
      <svg
        aria-hidden={title ? undefined : true}
        className={cn(
          "qx-bot size-4 shrink-0",
          thinking && "qx-thinking",
          happy && "qx-happy",
          className,
        )}
        fill="none"
        role={title ? "img" : undefined}
        viewBox="0 0 24 24"
      >
        {title && <title>{title}</title>}
        <g
          className="qx-head"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        >
          <path d="M8.5 7.5h7c2.5 0 4 1.5 4 4V16c0 2.5-1.5 4-4 4h-7c-2.5 0-4-1.5-4-4v-4.5c0-2.5 1.5-4 4-4ZM12 7.5V4.75M2 13v2M22 13v2M10 16.5h4" />
          <g className="qx-eyes-open" strokeWidth={2.25}>
            <path className="qx-eye" d="M9.25 12.25v1" />
            <path className="qx-eye qx-eye-r" d="M14.75 12.25v1" />
          </g>
          <path
            className="qx-eyes-happy"
            d="M8.25 13.4l1-1.1 1 1.1M13.75 13.4l1-1.1 1 1.1"
          />
          <circle
            className="qx-halo"
            cx="12"
            cy="2.9"
            fill="url(#qx-halo-fill)"
            r="2.6"
            stroke="none"
          />
          <g stroke="none">
            {HUES.map((hue) => (
              <circle
                className="qx-hue"
                cx="12"
                cy="2.9"
                fill={hue}
                key={hue}
                r="1.35"
              />
            ))}
          </g>
          <g stroke="none">
            {SPARKS.map((spark) => (
              <circle
                className="qx-spark"
                cx={spark.cx}
                cy={spark.cy}
                fill="#fde68a"
                key={spark.sx}
                r=".55"
                style={
                  {
                    "--sx": spark.sx,
                    "--sy": spark.sy,
                  } as CSSProperties
                }
              />
            ))}
          </g>
        </g>
        <defs>
          <radialGradient id="qx-halo-fill">
            <stop offset="0" stopColor="#f0abfc" stopOpacity=".9" />
            <stop offset="1" stopColor="#f0abfc" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </>
  );
}
