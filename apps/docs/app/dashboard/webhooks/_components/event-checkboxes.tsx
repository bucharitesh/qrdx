"use client";

import { toast } from "@repo/design-system";
import { Tick as Check } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Copy } from "iconsax-reactjs";
import { type ComponentProps, useState } from "react";
import { EVENT_INFO } from "@/lib/events/types";
import { soundEvent } from "@/lib/sound/emit";

/** Checkbox per event with its label, wire name and description. */
export function EventCheckboxes<E extends keyof typeof EVENT_INFO>({
  events,
  value,
  onChange,
  disabled,
  idPrefix,
  showWireNames = true,
}: {
  events: readonly E[];
  value: E[];
  onChange: (next: E[]) => void;
  disabled?: boolean;
  idPrefix: string;
  showWireNames?: boolean;
}) {
  return (
    <div className="space-y-2">
      {events.map((event) => {
        const id = `${idPrefix}-${event}`;
        const checked = value.includes(event);
        return (
          <label
            className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[button:disabled]:cursor-not-allowed has-[button:disabled]:opacity-60"
            htmlFor={id}
            key={event}
          >
            <Checkbox
              checked={checked}
              className="mt-0.5"
              disabled={disabled}
              id={id}
              onCheckedChange={(next) =>
                onChange(
                  next === true
                    ? [...value.filter((item) => item !== event), event]
                    : value.filter((item) => item !== event),
                )
              }
            />
            <span className="min-w-0 space-y-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                {EVENT_INFO[event].label}
                {showWireNames && (
                  <code className="text-muted-foreground font-mono text-xs font-normal">
                    {event}
                  </code>
                )}
              </span>
              <span className="text-muted-foreground block text-xs">
                {EVENT_INFO[event].description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  ...props
}: { value: string; label?: string } & Omit<
  ComponentProps<typeof Button>,
  "value" | "onClick"
>) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          soundEvent("copy");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy. Select the text and copy it instead.");
        }
      }}
      size="icon-sm"
      type="button"
      variant="outline"
      {...props}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
