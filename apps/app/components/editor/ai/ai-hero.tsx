import { cn } from "@repo/design-system/lib/utils";
import { AIBotBadge } from "./ai-bot-badge";

/** Animated bot on an aurora, with the greeting and a one-line subtitle. */
export function AIHero({
  greeting,
  subtitle = "Describe a vibe, upload an image, or remix a theme.",
  thinking,
  align = "start",
  className,
}: {
  greeting: string;
  subtitle?: string;
  thinking?: boolean;
  align?: "start" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" ? "items-center text-center" : "items-start",
        className,
      )}
    >
      <AIBotBadge thinking={thinking} />
      <div className="space-y-1.5">
        <h2 className="text-[clamp(22px,6cqw,30px)] leading-[1.1] font-semibold tracking-[-0.035em] text-balance">
          {greeting}
        </h2>
        <p className="text-muted-foreground text-sm text-pretty">{subtitle}</p>
      </div>
    </div>
  );
}
