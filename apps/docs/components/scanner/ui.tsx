"use client";

import { toast } from "@repo/design-system";
import { Tick as Check } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Copy } from "iconsax-reactjs";
import { type ReactNode, useState } from "react";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy. Select the text and copy it instead.");
        }
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function FieldList({
  fields,
}: {
  fields: { label: string; value: ReactNode; mono?: boolean }[];
}) {
  if (fields.length === 0) return null;
  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
      {fields.map((field) => (
        <div className="contents" key={field.label}>
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd
            className={cn(
              "min-w-0 break-words whitespace-pre-wrap",
              field.mono && "font-mono text-[13px] break-all",
            )}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Text link styled as an outline button; external links open in a new tab. */
export function LinkButton({
  href,
  children,
  external = false,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  return (
    <Button asChild size="sm" variant="outline">
      <a
        href={href}
        {...(external && {
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        })}
      >
        {children}
      </a>
    </Button>
  );
}
