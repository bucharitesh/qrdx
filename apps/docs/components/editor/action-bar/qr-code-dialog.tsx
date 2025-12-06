"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import {
  ScrollArea,
  ScrollBar,
} from "@repo/design-system/components/ui/scroll-area";
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { useQREditorStore } from "@/store/editor-store";

interface QRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QRCodeDialog({ open, onOpenChange }: QRCodeDialogProps) {
  const { value, style } = useQREditorStore();
  const [copied, setCopied] = useState(false);

  // Generate full component code
  const fullComponentCode = useMemo(() => {
    const props: string[] = [];

    if (value) {
      props.push(`      value="${value}"`);
    }
    if (style.bgColor) {
      props.push(`      bgColor="${style.bgColor}"`);
    }
    if (style.fgColor) {
      props.push(`      fgColor="${style.fgColor}"`);
    }
    if (style.eyeColor) {
      props.push(`      eyeColor="${style.eyeColor}"`);
    }
    if (style.dotColor) {
      props.push(`      dotColor="${style.dotColor}"`);
    }
    if (style.bodyPattern) {
      props.push(`      bodyPattern="${style.bodyPattern}"`);
    }
    if (style.cornerEyePattern) {
      props.push(`      cornerEyePattern="${style.cornerEyePattern}"`);
    }
    if (style.cornerEyeDotPattern) {
      props.push(`      cornerEyeDotPattern="${style.cornerEyeDotPattern}"`);
    }
    if (style.level) {
      props.push(`      level="${style.level}"`);
    }
    if (style.templateId) {
      props.push(`      templateId="${style.templateId}"`);
    }
    if (style.showLogo !== undefined) {
      props.push(`      hideLogo={${!style.showLogo}}`);
    }
    if (style.customLogo) {
      props.push(`      logo="${style.customLogo}"`);
    }
    if (style.size) {
      props.push(`      size={${style.size}}`);
    }

    return `import { QRCode } from "qrdx";

export function MyQRCode() {
  return (
    <QRCode
${props.join("\n")}
    />
  );
}`;
  }, [value, style]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullComponentCode);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="h-[90dvh] max-h-[90dvh] overflow-hidden p-6 shadow-lg sm:h-[80dvh] sm:max-h-[min(700px,90dvh)] sm:w-[calc(100%-2rem)] sm:max-w-4xl" showCloseButton={true}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>QR Code Component</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            View and copy the code for your QR code component.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex h-full flex-col">
          {/* Code container with file tab header like tweakcn */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
            {/* File tab header */}
            <div className="bg-muted/50 flex flex-none items-center justify-between border-b px-4 py-2">
              <div className="flex h-8 items-center">
                <span className="bg-background rounded-sm px-3 py-1 text-sm font-medium">
                  component.tsx
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-8"
                aria-label={
                  copied ? "Copied to clipboard" : "Copy to clipboard"
                }
              >
                {copied ? (
                  <>
                    <Check className="size-4" />
                    <span className="sr-only md:not-sr-only">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    <span className="sr-only md:not-sr-only">Copy</span>
                  </>
                )}
              </Button>
            </div>
            {/* Code content */}
            <ScrollArea className="relative flex-1">
              <CodeBlock
                code={fullComponentCode}
                language="tsx"
                className="h-full rounded-none border-0"
              />
              <ScrollBar orientation="horizontal" />
              <ScrollBar orientation="vertical" />
            </ScrollArea>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
