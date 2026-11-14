"use client";

import { Close as X } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Copy, Gps as LocateFixed, Add as Plus } from "iconsax-reactjs";
import { useId, useMemo } from "react";
import { FieldRow, TextField } from "@/components/landing/editor/fields";
import { WEEKDAYS } from "@/components/landing/opening-hours";
import type { BlockEditorProps } from "../registry";
import type { HoursProps } from "./hours";

type Day = HoursProps["days"][number];

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

export function HoursEditor({ value, onChange }: BlockEditorProps<HoursProps>) {
  const set = (patch: Partial<HoursProps>) => onChange({ ...value, ...patch });
  const zoneId = useId();
  const listId = useId();
  const zones = useMemo(timeZones, []);

  const setDay = (index: number, day: Day) =>
    set({
      days: value.days.map((current, i) => (i === index ? day : current)),
    });

  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        maxLength={80}
        onChange={(title) => set({ title })}
        value={value.title}
      />
      <FieldRow
        hint="Used for the Open now badge. Leave empty to hide it."
        htmlFor={zoneId}
        label="Time zone"
      >
        <div className="flex gap-2">
          <Input
            id={zoneId}
            list={listId}
            maxLength={64}
            onChange={(event) => set({ timezone: event.target.value })}
            placeholder="Europe/Berlin"
            value={value.timezone}
          />
          <Button
            onClick={() =>
              set({
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })
            }
            size="sm"
            title="Use my time zone"
            type="button"
            variant="outline"
          >
            <LocateFixed />
            Mine
          </Button>
        </div>
        <datalist id={listId}>
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </FieldRow>

      <div className="space-y-2">
        {WEEKDAYS.map((name, index) => {
          const day = value.days[index] ?? { ranges: [] };
          const open = day.ranges.length > 0;
          return (
            <div className="space-y-2 rounded-md border p-2.5" key={name}>
              <div className="flex items-center gap-2">
                <Switch
                  aria-label={`Open on ${name}`}
                  checked={open}
                  onCheckedChange={(checked) =>
                    setDay(index, {
                      ranges: checked
                        ? [{ open: "09:00", close: "17:00" }]
                        : [],
                    })
                  }
                />
                <span className="flex-1 text-sm font-medium">{name}</span>
                {!open && (
                  <span className="text-muted-foreground text-xs">Closed</span>
                )}
                {index > 0 && (
                  <Button
                    aria-label={`Copy hours from ${WEEKDAYS[index - 1]}`}
                    className="size-7"
                    onClick={() =>
                      setDay(
                        index,
                        structuredClone(value.days[index - 1] ?? day),
                      )
                    }
                    size="icon"
                    title="Same as the day before"
                    type="button"
                    variant="ghost"
                  >
                    <Copy />
                  </Button>
                )}
              </div>
              {day.ranges.map((range, rangeIndex) => (
                <div className="flex items-center gap-2 pl-10" key={rangeIndex}>
                  <Input
                    aria-label={`${name} opens`}
                    className="h-8"
                    onChange={(event) =>
                      setDay(index, {
                        ranges: day.ranges.map((r, i) =>
                          i === rangeIndex
                            ? { ...r, open: event.target.value }
                            : r,
                        ),
                      })
                    }
                    type="time"
                    value={range.open}
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input
                    aria-label={`${name} closes`}
                    className="h-8"
                    onChange={(event) =>
                      setDay(index, {
                        ranges: day.ranges.map((r, i) =>
                          i === rangeIndex
                            ? { ...r, close: event.target.value }
                            : r,
                        ),
                      })
                    }
                    type="time"
                    value={range.close}
                  />
                  <Button
                    aria-label="Remove these hours"
                    className="size-7"
                    onClick={() =>
                      setDay(index, {
                        ranges: day.ranges.filter((_, i) => i !== rangeIndex),
                      })
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </div>
              ))}
              {open && day.ranges.length < 3 && (
                <Button
                  className="ml-8 h-7"
                  onClick={() =>
                    setDay(index, {
                      ranges: [
                        ...day.ranges,
                        { open: "18:00", close: "22:00" },
                      ],
                    })
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Plus />
                  Add hours
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <TextField
        label="Note"
        maxLength={200}
        onChange={(note) => set({ note })}
        placeholder="Optional, e.g. Closed on public holidays"
        value={value.note}
      />
    </div>
  );
}
