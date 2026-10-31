"use client";

import { toast } from "@repo/design-system";
import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { Book1, Copy } from "iconsax-reactjs";
import Link from "next/link";
import type { ColorConfig } from "qrdx/types";
import { normalizeColorConfig } from "qrdx/types";
import { useMemo, useState } from "react";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { emitSound } from "@/components/editor/sound";
import { InfoHint } from "@/components/help/info-hint";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
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
  const [copied, setCopied] = useState<"code" | "install" | null>(null);

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
    if (style.margin) {
      props.push(`${indent}margin={${style.margin}}`);
    }
    if (style.frame && style.frame.style !== "none") {
      props.push(`${indent}frame={${JSON.stringify(style.frame)}}`);
    }
    if (style.showLogo !== undefined) {
      props.push(`${indent}hideLogo={${!style.showLogo}}`);
    }
    if (style.showLogo) {
      props.push(`${indent}logo="${style.customLogo ?? DEFAULT_QR_LOGO}"`);
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

  const copy = async (text: string, what: "code" | "install") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      emitSound("copy");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  };

  const lineCount = fullComponentCode.split("\n").length;

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-3xl dark:!border-border">
        <div className="flex max-h-[inherit] min-h-0 flex-col">
          <ResponsiveDialogHeader className="flex-row items-start gap-3 px-6 pt-1 pb-0 text-left sm:pt-6">
            <div className="min-w-0 flex-1 space-y-1">
              <ResponsiveDialogTitle>
                Use this design in React
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                Install the open-source{" "}
                <code className="font-mono text-xs">qrdx</code> package and drop
                in this component. It renders exactly what you see in the
                editor.
              </ResponsiveDialogDescription>
            </div>
            <DialogCloseButton className="-mt-1 -mr-2 hidden sm:inline-flex" />
          </ResponsiveDialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-5 pb-6">
            <div className="bg-muted/40 flex h-10 items-center gap-2 rounded-full border pr-1 pl-4">
              <span className="text-muted-foreground font-mono text-xs select-none">
                $
              </span>
              <code className="min-w-0 flex-1 truncate font-mono text-xs">
                npm install qrdx
              </code>
              <Button
                aria-label={
                  copied === "install"
                    ? "Install command copied"
                    : "Copy install command"
                }
                className="text-muted-foreground hover:text-foreground"
                onClick={() => copy("npm install qrdx", "install")}
                size="icon-sm"
                variant="ghost"
              >
                {copied === "install" ? <Tick /> : <Copy />}
              </Button>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
              <div className="bg-muted/40 flex items-center justify-between gap-2 border-b py-1.5 pr-1.5 pl-4">
                <span className="text-muted-foreground font-mono text-xs">
                  my-qr-code.tsx
                  <span className="text-muted-foreground/60">
                    {" "}
                    · {lineCount} lines
                  </span>{" "}
                  <InfoHint align="start" id="react-component" />
                </span>
                <Button
                  aria-live="polite"
                  onClick={() => copy(fullComponentCode, "code")}
                  size="sm"
                  variant={copied === "code" ? "secondary" : "outline"}
                >
                  {copied === "code" ? <Tick /> : <Copy />}
                  {copied === "code" ? "Copied" : "Copy code"}
                </Button>
              </div>
              <div className="max-h-[min(52dvh,460px)] overflow-auto [&_button]:hidden [&_figure]:my-0 [&_figure]:rounded-none [&_figure]:border-0 [&_figure]:bg-transparent [&_figure]:shadow-none [&_figure>div]:max-h-none [&_pre]:py-3 [&_pre]:text-[13px]">
                <DynamicCodeBlock code={fullComponentCode} lang="tsx" />
              </div>
            </div>

            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Book1 className="size-3.5 shrink-0" />
              <span>
                Props, frames and downloads are covered in the{" "}
                <Link
                  className="text-foreground font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                  href="/docs"
                  onClick={() => onOpenChange(false)}
                >
                  docs
                </Link>
                .
              </span>
            </p>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
