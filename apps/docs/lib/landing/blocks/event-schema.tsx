import { z } from "zod";
import {
  emailSchema,
  lineText,
  linkUrlSchema,
  longText,
} from "@/components/landing/block-kit";
import { landingUrlSchema } from "@/types/landing";
import {
  type CalendarEvent,
  isValidLocalDateTime,
  isValidTimeZone,
} from "./event-calendar";

// Props of the event block (shared by its Render, Editor and /api/calendar).

const optional = <T extends z.ZodType<string>>(schema: T) =>
  schema.or(z.literal("")).default("");

/** A week from today at 19:00, so new event blocks start in the future. */
const defaultStart = () =>
  `${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T19:00`;

const localDateTime = z
  .string()
  .trim()
  .refine(isValidLocalDateTime, "Pick a date and time");

export const eventSchema = z
  .object({
    title: lineText(120).min(1, "Name the event"),
    description: longText(2000).default(""),
    /** Wall-clock "YYYY-MM-DDTHH:mm" in `timeZone` ("YYYY-MM-DD" when all day) */
    start: localDateTime.default(defaultStart),
    end: optional(localDateTime),
    allDay: z.boolean().default(false),
    timeZone: z
      .string()
      .trim()
      .max(64)
      .refine(isValidTimeZone, "Pick a time zone")
      .default("UTC"),
    venue: lineText(120).default(""),
    /** One line; used for the map link and calendar location */
    address: lineText(300).default(""),
    onlineUrl: optional(landingUrlSchema),
    organizer: lineText(120).default(""),
    organizerEmail: optional(emailSchema),
    organizerUrl: optional(landingUrlSchema),
    cta: z
      .object({ label: lineText(40).min(1, "Add a label"), url: linkUrlSchema })
      .optional(),
    /** Google / Outlook / Yahoo links and the .ics download */
    showCalendar: z.boolean().default(true),
  })
  .superRefine((event, ctx) => {
    if (!event.end) return;
    const length = event.allDay ? 10 : 16;
    const start = event.start.slice(0, length);
    const end = event.end.slice(0, length);
    if (event.allDay ? end < start : end <= start) {
      ctx.addIssue({
        code: "custom",
        message: "The event ends before it starts",
        path: ["end"],
      });
    }
  });

export type EventProps = z.output<typeof eventSchema>;

/** The block as a calendar entry (links, .ics). */
export function toCalendarEvent(props: EventProps): CalendarEvent {
  const location = [props.venue, props.address].filter(Boolean).join(", ");
  const ctaUrl =
    props.cta && /^https?:/i.test(props.cta.url) ? props.cta.url : "";
  return {
    title: props.title,
    description: props.description || undefined,
    location: location || props.onlineUrl || undefined,
    url: props.onlineUrl || ctaUrl || undefined,
    start: props.start,
    end: props.end || undefined,
    allDay: props.allDay,
    timeZone: props.timeZone,
    organizer:
      props.organizer || props.organizerEmail
        ? {
            name: props.organizer || undefined,
            email: props.organizerEmail || undefined,
          }
        : undefined,
  };
}
