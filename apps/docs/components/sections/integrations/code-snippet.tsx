"use client";

import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Copy } from "iconsax-reactjs";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-clipboard";

export function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  /** What is copied, for the accessible name ("Copy {label}"). */
  label: string;
  className?: string;
}) {
  const { copyToClipboard, hasCopied } = useCopyToClipboard();

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn("h-7 gap-1.5 px-2.5 text-xs", className)}
      onClick={() => copyToClipboard(text)}
      aria-label={hasCopied ? "Copied" : `Copy ${label}`}
    >
      {hasCopied ? (
        <Tick className="size-3.5" />
      ) : (
        <Copy aria-hidden className="size-3.5" />
      )}
      {hasCopied ? "Copied" : "Copy"}
    </Button>
  );
}

interface CodeSnippetProps {
  code: string;
  label?: string;
  /** Shell commands and one-liners wrap; JSON and code keep indentation. */
  wrap?: boolean;
  className?: string;
}

/** Bordered code block with a header row and a copy button. */
export function CodeSnippet({
  code,
  label,
  wrap = false,
  className,
}: CodeSnippetProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border bg-muted/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b py-1 pr-1 pl-3.5">
        <span className="truncate font-mono text-xs text-muted-foreground">
          {label ?? "Code"}
        </span>
        <CopyButton text={code} label={label ?? "code"} />
      </div>
      <pre
        className={cn(
          "overflow-x-auto p-3.5 font-mono text-[12.5px] leading-relaxed text-foreground/90",
          wrap && "break-all whitespace-pre-wrap",
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
