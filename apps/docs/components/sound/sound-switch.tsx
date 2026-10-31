"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { cn } from "@repo/design-system/lib/utils";
import { useSound } from "@/lib/sound";

/** Compact "Sounds" row for the playground's shortcuts dialog. */
export function SoundSwitch({ className }: { className?: string }) {
  const { muted, setMuted } = useSound();

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2.5",
        className,
      )}
    >
      <Label
        htmlFor="playground-sounds"
        className="text-sm font-normal text-muted-foreground"
      >
        Sounds
      </Label>
      <Switch
        id="playground-sounds"
        checked={!muted}
        onCheckedChange={(on) => setMuted(!on)}
      />
    </div>
  );
}
