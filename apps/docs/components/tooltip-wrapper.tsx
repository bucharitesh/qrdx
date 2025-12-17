"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { Kbd, KbdGroup } from "@repo/design-system/components/ui/kbd";
import type React from "react";
import { useUserSettings } from "@/lib/hooks/use-user-settings";

interface TooltipWrapperProps {
  label: string | React.ReactNode;
  children: React.ReactElement;
  asChild?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  kbd?: string | string[];
  delayDuration?: number;
  contentClassName?: string;
}

export function TooltipWrapper({
  label,
  children,
  asChild,
  side = "bottom",
  align = "center",
  kbd,
  delayDuration = 300,
  contentClassName,
}: TooltipWrapperProps) {
  const { settings } = useUserSettings();
  const showKbd = kbd && (settings?.keyboardShortcuts ?? true);

  const content = typeof label === "string" ? (
    <div className="flex items-center gap-2">
      <span className="text-xs">{label}</span>
      {showKbd && kbd && (
        <KbdGroup>
          {Array.isArray(kbd) ? (
            kbd.map((key, index) => <Kbd key={index}>{key}</Kbd>)
          ) : (
            <Kbd>{kbd}</Kbd>
          )}
        </KbdGroup>
      )}
    </div>
  ) : (
    label
  );

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent side={side} align={align} className={contentClassName}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
