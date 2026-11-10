"use client";

// The Display menu and the live search field the codes and pages lists
// share.

import { Close as X } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { cn } from "@repo/design-system/lib/utils";
import {
  Element3,
  RowVertical,
  SearchNormal1 as Search,
  Setting4,
} from "iconsax-reactjs";
import { useEffect, useRef, useState } from "react";
import {
  CODE_PROPERTIES,
  CODE_PROPERTY_LABELS,
  type CodeProperty,
  type ListView,
  toggleProperty,
} from "@/app/(app)/dashboard/codes/_lib/display";
import { useListDisplay } from "./list-display";

export function DisplayMenu({
  sort,
  properties = CODE_PROPERTIES,
}: {
  /** Sort order, when the list has one */
  sort?: {
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
  };
  /** The properties offered; none hides the "Show" section */
  properties?: readonly CodeProperty[];
}) {
  const { display, setDisplay } = useListDisplay();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Setting4 aria-hidden />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-4 p-4">
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-medium">View</p>
          <ToggleGroup
            className="w-full"
            onValueChange={(value) => {
              if (value === "cards" || value === "rows") {
                setDisplay({ ...display, view: value as ListView });
              }
            }}
            type="single"
            value={display.view}
            variant="outline"
          >
            <ToggleGroupItem className="flex-1 gap-1.5" value="cards">
              <Element3 aria-hidden className="size-4" />
              Cards
            </ToggleGroupItem>
            <ToggleGroupItem className="flex-1 gap-1.5" value="rows">
              <RowVertical aria-hidden className="size-4" />
              Rows
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {sort && (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">Sort by</p>
            <Select onValueChange={sort.onChange} value={sort.value}>
              <SelectTrigger aria-label="Sort by" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sort.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {properties.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">Show</p>
            <div className="flex flex-wrap gap-1.5">
              {properties.map((property) => {
                const on = display.properties.includes(property);
                return (
                  <button
                    aria-pressed={on}
                    className={cn(
                      "focus-visible:ring-ring/50 h-7 rounded-full border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px]",
                      on
                        ? "bg-foreground text-background border-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    key={property}
                    onClick={() =>
                      setDisplay(toggleProperty(display, property))
                    }
                    type="button"
                  >
                    {CODE_PROPERTY_LABELS[property]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A search field that filters as you type (after a short pause), with no
 * button. Esc clears it.
 */
export function ListSearch({
  value,
  onSearch,
  placeholder,
  label,
  className,
}: {
  value: string;
  onSearch: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const sent = useRef(value);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  // A new value from outside (a cleared chip, back button) wins.
  useEffect(() => {
    sent.current = value;
    setText(value);
  }, [value]);

  useEffect(() => {
    const next = text.trim();
    if (next === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = next;
      onSearchRef.current(next);
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div className={cn("relative min-w-0", className)}>
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
      />
      <Input
        aria-label={label}
        className="pr-8 pl-8"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) {
            event.preventDefault();
            setText("");
          }
        }}
        placeholder={placeholder}
        type="search"
        value={text}
      />
      {text && (
        <button
          aria-label="Clear search"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5"
          onClick={() => setText("")}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
