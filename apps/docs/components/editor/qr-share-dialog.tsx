"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { Input } from "@repo/design-system/components/ui/input";
import { toast } from "@repo/design-system";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import useMediaQuery from "@repo/design-system/hooks/use-media-query";
import { cn } from "@repo/design-system/lib/utils";

interface QRShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}

export function QRShareDialog({ open, onOpenChange, url }: QRShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const MOBILE_BREAKPOINT = "(min-width: 640px)";
  const isDesktop = useMediaQuery(MOBILE_BREAKPOINT);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Share link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className={cn("", isDesktop ? "p-6" : "p-2")} showCloseButton={true}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Share QR Code</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Share this link with others to show them your QR code design.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Input value={url} readOnly className="flex-1" />
            <Button size="sm" onClick={handleCopy} className="shrink-0">
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
