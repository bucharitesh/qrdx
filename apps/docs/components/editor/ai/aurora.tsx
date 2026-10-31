import { cn } from "@repo/design-system/lib/utils";

const AURORA_CSS = `
@keyframes qx-aurora-a { 0%,100% { transform: translate(-12%, -8%) scale(1); } 50% { transform: translate(14%, 10%) scale(1.15); } }
@keyframes qx-aurora-b { 0%,100% { transform: translate(14%, 6%) scale(1.1); } 50% { transform: translate(-10%, -12%) scale(.9); } }
@keyframes qx-aurora-c { 0%,100% { transform: translate(0, 14%) scale(.9); } 50% { transform: translate(6%, -10%) scale(1.2); } }
.qx-aurora-a { animation: qx-aurora-a 9s ease-in-out infinite; }
.qx-aurora-b { animation: qx-aurora-b 11s ease-in-out infinite; }
.qx-aurora-c { animation: qx-aurora-c 13s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .qx-aurora-a, .qx-aurora-b, .qx-aurora-c { animation: none; } }
`;

/** Soft, slow-moving blurred colour blobs (decorative). */
export function Aurora({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute opacity-60 blur-2xl dark:opacity-70",
        className,
      )}
    >
      <style href="qrdx-ai-aurora" precedence="default">
        {AURORA_CSS}
      </style>
      <span className="qx-aurora-a absolute top-[10%] left-[8%] size-[60%] rounded-full bg-violet-400/60 dark:bg-violet-500/50" />
      <span className="qx-aurora-b absolute top-[22%] right-[6%] size-[55%] rounded-full bg-pink-400/50 dark:bg-pink-500/40" />
      <span className="qx-aurora-c absolute bottom-[6%] left-[24%] size-[50%] rounded-full bg-cyan-300/50 dark:bg-cyan-400/35" />
    </div>
  );
}
