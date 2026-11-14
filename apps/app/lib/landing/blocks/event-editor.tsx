"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { useId, useMemo } from "react";
import {
  FieldRow,
  SwitchField,
  TextField,
  UrlField,
} from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import type { EventProps } from "./event-schema";

const selectClass =
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  if (!zones.includes("UTC")) zones = ["UTC", ...zones];
  return zones.includes(current) ? zones : [current, ...zones];
}

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

function DateTimeField({
  label,
  value,
  allDay,
  onChange,
  min,
  hint,
}: {
  label: string;
  value: string;
  allDay: boolean;
  onChange: (value: string) => void;
  min?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <FieldRow hint={hint} htmlFor={id} label={label}>
      <Input
        id={id}
        min={min || undefined}
        onChange={(event) => onChange(event.target.value)}
        type={allDay ? "date" : "datetime-local"}
        value={allDay ? value.slice(0, 10) : value}
      />
    </FieldRow>
  );
}

/** Keeps start/end in the format the all-day switch expects. */
function convert(value: string, allDay: boolean, time: string): string {
  if (!value) return value;
  return allDay ? value.slice(0, 10) : `${value.slice(0, 10)}T${time}`;
}

export function EventEditor({ value, onChange }: BlockEditorProps<EventProps>) {
  const set = (patch: Partial<EventProps>) => onChange({ ...value, ...patch });
  const zones = useMemo(() => timeZones(value.timeZone), [value.timeZone]);
  const zoneId = useId();
  const localZone = useMemo(browserTimeZone, []);

  return (
    <div className="space-y-4">
      <TextField
        label="Event name"
        maxLength={120}
        onChange={(title) => set({ title })}
        value={value.title}
      />
      <TextField
        label="Description"
        maxLength={2000}
        multiline
        onChange={(description) => set({ description })}
        rows={3}
        value={value.description}
      />
      <SwitchField
        checked={value.allDay}
        label="All-day event"
        onChange={(allDay) =>
          set({
            allDay,
            start: convert(value.start, allDay, "19:00"),
            end: convert(value.end, allDay, "21:00"),
          })
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <DateTimeField
          allDay={value.allDay}
          label="Starts"
          onChange={(start) => start && set({ start })}
          value={value.start}
        />
        <DateTimeField
          allDay={value.allDay}
          hint={
            value.allDay ? "Last day (optional)" : "Optional (default: 1 hour)"
          }
          label="Ends"
          min={value.allDay ? value.start.slice(0, 10) : value.start}
          onChange={(end) => set({ end })}
          value={value.end}
        />
      </div>
      {!value.allDay && (
        <FieldRow
          hint="Times are shown to visitors in this time zone."
          htmlFor={zoneId}
          label="Time zone"
        >
          <div className="flex gap-2">
            <select
              className={selectClass}
              id={zoneId}
              onChange={(event) => set({ timeZone: event.target.value })}
              value={value.timeZone}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            {localZone !== value.timeZone && (
              <Button
                className="shrink-0"
                onClick={() => set({ timeZone: localZone })}
                size="sm"
                title={`Use ${localZone}`}
                type="button"
                variant="outline"
              >
                Use mine
              </Button>
            )}
          </div>
        </FieldRow>
      )}
      <TextField
        label="Venue"
        maxLength={120}
        onChange={(venue) => set({ venue })}
        placeholder="The Grand Hall"
        value={value.venue}
      />
      <TextField
        hint="Used for the map link and calendar entries."
        label="Address"
        maxLength={300}
        onChange={(address) => set({ address })}
        placeholder="1 Main Street, Springfield"
        value={value.address}
      />
      <UrlField
        hint="Livestream or video call, if any"
        label="Online link"
        onChange={(onlineUrl) => set({ onlineUrl })}
        value={value.onlineUrl}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Organizer"
          maxLength={120}
          onChange={(organizer) => set({ organizer })}
          value={value.organizer}
        />
        <TextField
          autoComplete="email"
          inputMode="email"
          label="Organizer email"
          maxLength={254}
          onChange={(organizerEmail) => set({ organizerEmail })}
          type="email"
          value={value.organizerEmail}
        />
      </div>
      <UrlField
        label="Organizer website"
        onChange={(organizerUrl) => set({ organizerUrl })}
        value={value.organizerUrl}
      />
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-xs font-medium">Button (optional)</p>
        <TextField
          label="Label"
          maxLength={40}
          onChange={(label) =>
            set({
              cta:
                label || value.cta?.url
                  ? { label, url: value.cta?.url ?? "" }
                  : undefined,
            })
          }
          placeholder="Get tickets"
          value={value.cta?.label}
        />
        <UrlField
          allowActions
          label="Link"
          onChange={(url) =>
            set({
              cta:
                url || value.cta?.label
                  ? { label: value.cta?.label ?? "", url }
                  : undefined,
            })
          }
          value={value.cta?.url}
        />
      </div>
      <SwitchField
        checked={value.showCalendar}
        hint="Google, Apple (.ics), Outlook and Yahoo"
        label="Add-to-calendar button"
        onChange={(showCalendar) => set({ showCalendar })}
      />
    </div>
  );
}
