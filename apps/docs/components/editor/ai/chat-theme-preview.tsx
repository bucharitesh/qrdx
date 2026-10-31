/** biome-ignore-all lint/a11y/useKeyWithClickEvents: false positive */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: false positive */

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import {
  InfoCircle as AlertCircle,
  TickCircle as CheckCheck,
  ArrowDown2 as ChevronsUpDown,
  MagicStar as Zap,
} from "iconsax-reactjs";
import { getNormalizedColor, QRCodeSVG } from "qrdx";
import { type ComponentProps, useState } from "react";
import { useFeedbackText } from "@/lib/hooks/use-feedback-text";
import { soundEvent } from "@/lib/sound/emit";
import type { ThemeStyles } from "@/types/theme";
import { applyGeneratedTheme } from "@/utils/ai/apply-theme";
import { AnimatedBot } from "./animated-bot";
import { ShineText } from "./shine-border";

type ChatThemePreviewProps = ComponentProps<"div"> & ChatThemePreviewPropsBase;

type ChatThemePreviewPropsBase =
  | {
      status: "loading";
      expanded?: boolean;
      themeStyles?: Partial<ThemeStyles>;
    }
  | {
      status: "error";
      expanded?: boolean;
      errorText?: string;
      themeStyles?: Partial<ThemeStyles>;
    }
  | {
      status: "complete";
      expanded?: boolean;
      themeStyles: ThemeStyles;
    };

export function ChatThemePreview({
  status,
  expanded = false,
  themeStyles,
  className,
  children,
  ...props
}: ChatThemePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const loading = status === "loading";

  const feedbackText = useFeedbackText({
    showFeedbackText: loading,
    feedbackMessages: FEEDBACK_MESSAGES,
    rotationIntervalInSeconds: 8,
  });

  if (loading) {
    return (
      <Card
        className={cn(
          "w-full max-w-[550px] gap-0 overflow-hidden rounded-lg py-0 shadow-none",
        )}
      >
        <div className="flex size-full h-11 items-center gap-2.5 p-2">
          <div className="bg-muted/60 grid size-7 place-items-center rounded-full border">
            <AnimatedBot className="size-4" thinking />
          </div>
          <ShineText className="text-sm font-medium">{feedbackText}</ShineText>
        </div>
      </Card>
    );
  }

  if (status === "error")
    return (
      <Card
        className={cn(
          "max-w-[550px] gap-0 overflow-hidden rounded-lg py-0 shadow-none",
        )}
      >
        <div className="flex size-full h-10 items-center gap-2 p-1.5">
          <div className="bg-destructive/10 text-destructive grid size-7 place-items-center rounded-full">
            <AlertCircle className="size-4" />
          </div>
          <span className="text-foreground/90 text-sm">
            Stopped or failed. Retry from the message above.
          </span>
        </div>
      </Card>
    );

  const handleApplyTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (status !== "complete") return;
    applyGeneratedTheme(themeStyles);
    soundEvent("apply");
  };

  if (status === "complete")
    return (
      <Card
        className={cn(
          "max-w-[550px] py-0 gap-0 overflow-hidden rounded-lg shadow-none",
        )}
      >
        <div
          className={cn(
            "group/control hover:bg-background/50 flex h-10 w-full shrink-0 cursor-pointer items-center gap-2 p-1.5 pr-2 transition-colors duration-300 ease-in-out",
            isExpanded ? "border-b" : "border-transparent",
          )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white p-0.5 ring-1 ring-black/10 [&_svg]:size-full">
            <QRCodeSVG
              bgColor={themeStyles.bgColor}
              bodyPattern={themeStyles.bodyPattern}
              cornerEyeDotPattern={themeStyles.cornerEyeDotPattern}
              cornerEyePattern={themeStyles.cornerEyePattern}
              dotColor={themeStyles.dotColor}
              eyeColor={themeStyles.eyeColor}
              fgColor={themeStyles.fgColor}
              level="L"
              margin={1}
              size={28}
              value="qrdx.dev"
            />
          </div>
          <CheckCheck
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            variant="Bold"
          />

          <div className="flex gap-1">
            <div
              className="ring-border size-3 rounded-sm ring-1 @sm:size-4"
              style={{ background: getNormalizedColor(themeStyles.bgColor) }}
            />
            <div
              className="ring-border size-3 rounded-sm ring-1 @sm:size-4"
              style={{ background: getNormalizedColor(themeStyles.fgColor) }}
            />
            <div
              className="ring-border size-3 rounded-sm ring-1 @sm:size-4"
              style={{ background: getNormalizedColor(themeStyles.dotColor) }}
            />
            <div
              className="ring-border size-3 rounded-sm ring-1 @sm:size-4"
              style={{ background: getNormalizedColor(themeStyles.eyeColor) }}
            />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              className="h-7 gap-1.5 px-2 shadow-none"
              onClick={handleApplyTheme}
            >
              <Zap className="size-3.5!" />
              Apply
            </Button>

            <button
              type="button"
              className="text-foreground/75 group-hover/control:text-foreground ml-auto transition-colors"
              aria-label={isExpanded ? "Collapse section" : "Expand section"}
            >
              <ChevronsUpDown
                className={cn(
                  "size-4 transition-transform",
                  isExpanded && "rotate-180",
                )}
              />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className={cn("space-y-2 p-2.5", className)} {...props}>
              {children}
            </div>
          </div>
        </div>
      </Card>
    );

  return null;
}

const FEEDBACK_MESSAGES = [
  "Picking colours that scan…",
  "Shaping the dots and eyes…",
  "Checking contrast…",
  "Almost there…",
];
