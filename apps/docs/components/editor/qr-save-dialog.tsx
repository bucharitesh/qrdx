"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import useMediaQuery from "@repo/design-system/hooks/use-media-query";
import { cn } from "@repo/design-system/lib/utils";

interface QRSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
  isSaving: boolean;
  initialThemeName?: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
}

export function QRSaveDialog({
  open,
  onOpenChange,
  onSave,
  isSaving,
  initialThemeName = "",
  title = "Save QR Code Theme",
  description = "Save your QR code design as a theme to reuse later.",
  ctaLabel = "Save Theme",
}: QRSaveDialogProps) {
  const [themeName, setThemeName] = useState(initialThemeName);
  const MOBILE_BREAKPOINT = "(min-width: 640px)";
  const isDesktop = useMediaQuery(MOBILE_BREAKPOINT);

  React.useEffect(() => {
    if (open) {
      setThemeName(initialThemeName);
    }
  }, [open, initialThemeName]);

  const handleSave = async () => {
    if (!themeName.trim()) return;
    await onSave(themeName);
    setThemeName("");
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className={cn("", isDesktop ? "p-6" : "p-2")} showCloseButton={true}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{description}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="theme-name">Theme Name</Label>
            <Input
              id="theme-name"
              placeholder="My Awesome QR Code"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && themeName.trim()) {
                  handleSave();
                }
              }}
              disabled={isSaving}
            />
          </div>
        </div>
        <ResponsiveDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !themeName.trim()}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {ctaLabel}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

