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
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { Check, Copy } from "lucide-react";
import type { ColorConfig } from "qrdx/types";
import { normalizeColorConfig } from "qrdx/types";
import { useMemo, useState } from "react";
import { useQREditorStore } from "@/store/editor-store";

interface QRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Serialize ColorConfig to a JavaScript object literal string with proper formatting
 * Returns a string that can be used inside JSX braces: fgColor={serialized}
 * @param color - The ColorConfig to serialize
 * @param baseIndent - Base indentation for the prop line (e.g., "      " for 6 spaces)
 */
function serializeColorConfig(
  color: ColorConfig | undefined,
  baseIndent: string = "      ",
): { value: string; isMultiLine: boolean } {
  if (!color) return { value: "", isMultiLine: false };

  // Handle string (backward compatibility)
  if (typeof color === "string") {
    return { value: `"${color}"`, isMultiLine: false };
  }

  const normalized = normalizeColorConfig(color);

  if (normalized.type === "solid") {
    return { value: `"${normalized.color}"`, isMultiLine: false };
  }

  // For gradients, serialize as formatted multi-line object
  // Indentation levels:
  // - baseIndent: prop line (e.g., "      ")
  // - baseIndent + "  ": object properties (e.g., "        ")
  // - baseIndent + "    ": array items (e.g., "          ")
  const indent1 = `${baseIndent}  `; // 2 spaces more than base
  const indent2 = `${baseIndent}    `; // 4 spaces more than base

  if (normalized.type === "linear") {
    const stops = normalized.stops
      .map(
        (stop) =>
          `${indent2}{ color: "${stop.color}", offset: ${stop.offset} }`,
      )
      .join(",\n");
    const angleLine =
      normalized.angle !== undefined
        ? `,\n${indent1}angle: ${normalized.angle}`
        : "";
    return {
      value: `{\n${indent1}type: "linear",\n${indent1}stops: [\n${stops},\n${indent1}],${angleLine},\n${baseIndent}}`,
      isMultiLine: true,
    };
  }

  if (normalized.type === "radial") {
    const stops = normalized.stops
      .map(
        (stop) =>
          `${indent2}{ color: "${stop.color}", offset: ${stop.offset} }`,
      )
      .join(",\n");
    return {
      value: `{\n${indent1}type: "radial",\n${indent1}stops: [\n${stops},\n${indent1}],\n${baseIndent}}`,
      isMultiLine: true,
    };
  }

  return { value: "", isMultiLine: false };
}

export function QRCodeDialog({ open, onOpenChange }: QRCodeDialogProps) {
  const { value, themeState } = useQREditorStore();
  const [copied, setCopied] = useState(false);

  const style = themeState.styles;

  // Generate full component code
  const fullComponentCode = useMemo(() => {
    const props: string[] = [];
    const indent = "      "; // 6 spaces to match JSX indentation

    if (value) {
      props.push(`${indent}value="${value}"`);
    }
    if (style.bgColor) {
      props.push(`${indent}bgColor="${style.bgColor}"`);
    }
    if (style.fgColor) {
      const serialized = serializeColorConfig(style.fgColor, indent);
      if (serialized.value) {
        if (serialized.isMultiLine) {
          props.push(`${indent}fgColor={${serialized.value}}`);
        } else {
          props.push(`${indent}fgColor={${serialized.value}}`);
        }
      }
    }
    if (style.eyeColor) {
      const serialized = serializeColorConfig(style.eyeColor, indent);
      if (serialized.value) {
        if (serialized.isMultiLine) {
          props.push(`${indent}eyeColor={${serialized.value}}`);
        } else {
          props.push(`${indent}eyeColor={${serialized.value}}`);
        }
      }
    }
    if (style.dotColor) {
      const serialized = serializeColorConfig(style.dotColor, indent);
      if (serialized.value) {
        if (serialized.isMultiLine) {
          props.push(`${indent}dotColor={${serialized.value}}`);
        } else {
          props.push(`${indent}dotColor={${serialized.value}}`);
        }
      }
    }
    if (style.bodyPattern) {
      props.push(`${indent}bodyPattern="${style.bodyPattern}"`);
    }
    if (style.cornerEyePattern) {
      props.push(`${indent}cornerEyePattern="${style.cornerEyePattern}"`);
    }
    if (style.cornerEyeDotPattern) {
      props.push(`${indent}cornerEyeDotPattern="${style.cornerEyeDotPattern}"`);
    }
    if (style.level) {
      props.push(`${indent}level="${style.level}"`);
    }
    if (style.templateId) {
      props.push(`${indent}templateId="${style.templateId}"`);
    }
    if (style.showLogo !== undefined) {
      props.push(`${indent}hideLogo={${!style.showLogo}}`);
    }
    if (style.customLogo) {
      props.push(`${indent}logo="${style.customLogo}"`);
    }
    if (style.size) {
      props.push(`${indent}size={${style.size}}`);
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
      <ResponsiveDialogContent
        className="h-[90dvh] max-h-[90dvh] overflow-hidden p-6 shadow-lg sm:h-[80dvh] sm:max-h-[min(700px,90dvh)] sm:w-[calc(100%-2rem)] sm:max-w-4xl"
        showCloseButton={true}
      >
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
              <div className="h-full w-full rounded-none border-0 bg-background [&_button[aria-label*='copy']]:hidden [&_button[aria-label*='Copy']]:hidden [&_pre]:m-0 [&_pre]:h-full [&_figure]:bg-transparent [&_figure]:border-0 [&_figure]:shadow-none [&_figure]:rounded-none">
                <DynamicCodeBlock lang="tsx" code={fullComponentCode} />
              </div>
              <ScrollBar orientation="horizontal" />
              <ScrollBar orientation="vertical" />
            </ScrollArea>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
