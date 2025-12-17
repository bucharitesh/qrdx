import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import { Kbd, KbdGroup } from "@repo/design-system/components/ui/kbd";
import { TabsTrigger } from "@repo/design-system/components/ui/tabs";
import { cn } from "@repo/design-system/lib/utils";
import type * as React from "react";

const TabsTriggerPill = ({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsTrigger>) => {
  return (
    <TabsTrigger
      className={cn(
        "ring-offset-background focus-visible:ring-ring data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground hover:text-muted-foreground/70 inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </TabsTrigger>
  );
};

interface TabsTriggerPillProps
  extends React.ComponentPropsWithoutRef<typeof TabsTrigger> {
  kbd?: string;
  label: string;
  description: string;
}

const TabsTriggerPillWithTooltip = ({
  label,
  description,
  children,
  className,
  kbd,
  ...props
}: TabsTriggerPillProps) => {
  const { settings } = useUserSettings();
  const showKbd = kbd && (settings?.keyboardShortcuts ?? true);

  return (
    <TooltipWrapper
      label={
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-black">{label}</span>
            {showKbd && kbd && (
              <KbdGroup className="ml-auto">
                {Array.isArray(kbd) ? (
                  kbd.map((key, index) => <Kbd key={index}>{key}</Kbd>)
                ) : (
                  <Kbd>{kbd}</Kbd>
                )}
              </KbdGroup>
            )}
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {description}
          </p>
        </div>
      }
      side="bottom"
      delayDuration={1000}
      contentClassName="max-w-[280px] px-3 py-2.5"
    >
      <TabsTriggerPill {...props}>{children}</TabsTriggerPill>
    </TooltipWrapper>
  );
};

export { TabsTriggerPillWithTooltip, TabsTriggerPill };
