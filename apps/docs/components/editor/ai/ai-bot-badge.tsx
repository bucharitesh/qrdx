import { cn } from "@repo/design-system/lib/utils";
import { AnimatedBot } from "./animated-bot";
import { Aurora } from "./aurora";

/** The AI generator's mark: the animated bot in frosted glass on a soft aurora. */
export function AIBotBadge({
  thinking,
  className,
}: {
  thinking?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative grid size-14 place-items-center", className)}>
      <Aurora className="-inset-5" />
      <span className="bg-background/70 relative grid size-12 place-items-center rounded-full border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_8px_20px_-8px_rgba(139,92,246,0.45)] backdrop-blur-md">
        <AnimatedBot className="size-7" thinking={thinking} title="QRdx AI" />
      </span>
    </span>
  );
}
