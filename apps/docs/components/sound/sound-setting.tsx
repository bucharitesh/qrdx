"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useSound } from "@/lib/sound";

/** Settings row for sound cues; applies at once and is remembered per browser. */
export function SoundSetting() {
  const { muted, setMuted } = useSound();

  return (
    <Card>
      <CardHeader className="sr-only">
        <CardTitle>Sounds</CardTitle>
        <CardDescription>Sound cues for important moments</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="sound-cues">Sounds</Label>
            <p className="text-muted-foreground text-sm">
              Quiet cues for copies, downloads, saves, payments, errors and
              playground edits. Saved in this browser.
            </p>
          </div>
          <Switch
            id="sound-cues"
            checked={!muted}
            onCheckedChange={(on) => setMuted(!on)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
