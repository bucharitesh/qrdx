"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Older in-app browsers: fall back to a hidden textarea.
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/** Copies `value` (coupon codes, Wi-Fi passwords) and confirms inline. */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  /** Accessible name, e.g. "Copy code" */
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-(--lp-radius) border border-(--lp-fg)/15 px-3 text-sm font-medium transition-colors hover:bg-(--lp-fg)/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--lp-primary)",
        className,
      )}
      onClick={async () => setCopied(await writeClipboard(value))}
      type="button"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
