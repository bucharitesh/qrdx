import { cn } from "@repo/design-system/lib/utils";
import { Clock } from "lucide-react";
import { z } from "zod";
import { lineText, mutedTextClass } from "@/components/landing/block-kit";
import { OpenNowBadge } from "@/components/landing/open-now-badge";
import { isValidTimeZone, WEEKDAYS } from "@/components/landing/opening-hours";
import { type BlockRenderProps, registerBlock } from "../registry";
import { HoursEditor } from "./hours-editor";

const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour times like 09:30");

const dayHoursSchema = z.object({
  /** Empty = closed that day */
  ranges: z
    .array(z.object({ open: timeSchema, close: timeSchema }))
    .max(3)
    .default([]),
});

const weekday = (open: string, close: string) => ({
  ranges: [{ open, close }],
});

export const DEFAULT_WEEK = [
  weekday("09:00", "17:00"),
  weekday("09:00", "17:00"),
  weekday("09:00", "17:00"),
  weekday("09:00", "17:00"),
  weekday("09:00", "17:00"),
  weekday("10:00", "14:00"),
  { ranges: [] },
];

export const hoursSchema = z.object({
  title: lineText(80).default("Opening hours"),
  /** IANA zone for "Open now", e.g. Europe/Berlin; empty hides the badge */
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine((value) => !value || isValidTimeZone(value), "Unknown time zone")
    .default(""),
  days: z
    .array(dayHoursSchema)
    .length(7)
    .default(() => structuredClone(DEFAULT_WEEK)),
  note: lineText(200).default(""),
});

export type HoursProps = z.output<typeof hoursSchema>;

function HoursBlock({ props }: BlockRenderProps<HoursProps>) {
  return (
    <section
      aria-label={props.title || "Opening hours"}
      className="space-y-3 rounded-(--lp-radius) bg-(--lp-muted) p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {props.title && (
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Clock aria-hidden="true" className="size-4 opacity-70" />
            {props.title}
          </h2>
        )}
        {props.timezone && (
          <OpenNowBadge timeZone={props.timezone} week={props.days} />
        )}
      </div>
      <table className="w-full text-[15px]">
        <tbody>
          {WEEKDAYS.map((day, index) => {
            const ranges = props.days[index]?.ranges ?? [];
            return (
              <tr
                className="border-t border-current/10 first:border-0"
                key={day}
              >
                <th className="py-1.5 pr-4 text-left font-normal" scope="row">
                  {day}
                </th>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums",
                    ranges.length === 0 && mutedTextClass,
                  )}
                >
                  {ranges.length === 0
                    ? "Closed"
                    : ranges
                        .map((range) => `${range.open}–${range.close}`)
                        .join(", ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {props.note && (
        <p className={cn("text-sm", mutedTextClass)}>{props.note}</p>
      )}
    </section>
  );
}

export const hoursBlock = registerBlock({
  type: "hours",
  category: "contact",
  label: "Opening hours",
  description: "Weekly hours with an Open now badge",
  icon: Clock,
  schema: hoursSchema,
  defaults: {},
  Render: HoursBlock,
  Editor: HoursEditor,
});
