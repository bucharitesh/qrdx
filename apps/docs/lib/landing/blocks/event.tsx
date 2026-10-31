import { cn } from "@repo/design-system/lib/utils";
import {
  CalendarDays,
  CalendarPlus,
  MapPin,
  UserRound,
  Video,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  buttonClass,
  linkProps,
  mailHref,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import {
  formatEventDisplay,
  googleCalendarUrl,
  isEventOver,
  mapSearchUrl,
  outlookCalendarUrl,
  yahooCalendarUrl,
} from "./event-calendar";
import { EventEditor } from "./event-editor";
import { EventIcsLink } from "./event-ics-link";
import { type EventProps, eventSchema, toCalendarEvent } from "./event-schema";

const linkClass =
  "font-medium text-(--lp-primary) underline-offset-4 hover:underline";
const calendarOptionClass =
  "flex min-h-11 items-center rounded-[calc(var(--lp-radius)*0.75)] px-3 text-sm font-medium hover:bg-(--lp-fg)/5 focus-visible:outline-2 focus-visible:outline-(--lp-primary)";

function Detail({
  icon: Icon,
  children,
}: {
  icon: typeof MapPin;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <Icon
        aria-hidden="true"
        className={cn(mutedTextClass, "mt-0.5 size-4 shrink-0")}
      />
      <div className="min-w-0 space-y-0.5">{children}</div>
    </div>
  );
}

export function EventBlock({
  id,
  props,
  context,
}: BlockRenderProps<EventProps>) {
  const calendar = toCalendarEvent(props);
  const display = formatEventDisplay(calendar);
  const over = isEventOver(calendar);
  const titleId = `${id}-title`;
  const place = [props.venue, props.address].filter(Boolean).join(", ");

  return (
    <article
      aria-labelledby={titleId}
      className={cn(surfaceClass, "overflow-hidden")}
    >
      <div className="flex gap-4 p-5">
        <div
          aria-hidden="true"
          className="flex w-16 shrink-0 flex-col items-center justify-center self-start rounded-(--lp-radius) bg-(--lp-primary) py-2 text-(--lp-primary-fg)"
        >
          <span className="text-xs font-semibold tracking-wider uppercase">
            {display.month}
          </span>
          <span className="text-2xl leading-none font-bold">{display.day}</span>
        </div>
        <div className="min-w-0 space-y-1">
          <h2
            className="text-xl leading-tight font-bold text-balance"
            id={titleId}
          >
            {props.title}
          </h2>
          <p className="text-sm font-medium">
            <time dateTime={display.iso}>{display.date}</time>
          </p>
          <p className={cn(mutedTextClass, "text-sm")}>{display.time}</p>
          {over && <p className="text-sm font-medium">This event has ended.</p>}
        </div>
      </div>

      <div className="space-y-4 border-t border-(--lp-fg)/10 p-5">
        {props.description && (
          <p className="text-[15px] leading-relaxed whitespace-pre-line">
            {props.description}
          </p>
        )}
        {place && (
          <Detail icon={MapPin}>
            {props.venue && <p className="font-medium">{props.venue}</p>}
            {props.address && <p className={mutedTextClass}>{props.address}</p>}
            <a
              className={linkClass}
              {...linkProps(mapSearchUrl(place), id, "map")}
            >
              Open in Maps
            </a>
          </Detail>
        )}
        {props.onlineUrl && (
          <Detail icon={Video}>
            <a
              className={linkClass}
              {...linkProps(props.onlineUrl, id, "online")}
            >
              Join online
            </a>
          </Detail>
        )}
        {(props.organizer || props.organizerEmail) && (
          <Detail icon={UserRound}>
            <p>
              Hosted by{" "}
              {props.organizerUrl ? (
                <a
                  className={linkClass}
                  {...linkProps(props.organizerUrl, id, "organizer")}
                >
                  {props.organizer || props.organizerUrl}
                </a>
              ) : (
                <span className="font-medium">
                  {props.organizer || props.organizerEmail}
                </span>
              )}
            </p>
            {props.organizerEmail && (
              <a className={linkClass} href={mailHref(props.organizerEmail)}>
                {props.organizerEmail}
              </a>
            )}
          </Detail>
        )}
        {props.cta && (
          <a
            className={buttonClass("filled")}
            {...linkProps(props.cta.url, id, "cta")}
          >
            {props.cta.label}
          </a>
        )}
        {props.showCalendar && !over && (
          <details className="group">
            <summary
              className={cn(
                buttonClass("outline"),
                "cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden",
              )}
            >
              <CalendarPlus aria-hidden="true" className="size-4" />
              Add to calendar
            </summary>
            <ul className="mt-2 grid gap-1 rounded-(--lp-radius) border border-(--lp-fg)/10 bg-(--lp-bg) p-1.5">
              <li>
                <a
                  className={calendarOptionClass}
                  {...linkProps(
                    googleCalendarUrl(calendar),
                    id,
                    "calendar-google",
                  )}
                >
                  Google Calendar
                </a>
              </li>
              <li>
                <EventIcsLink
                  blockId={id}
                  className={calendarOptionClass}
                  live={context.mode === "live"}
                >
                  Apple Calendar (.ics)
                </EventIcsLink>
              </li>
              <li>
                <a
                  className={calendarOptionClass}
                  {...linkProps(
                    outlookCalendarUrl(calendar),
                    id,
                    "calendar-outlook",
                  )}
                >
                  Outlook.com
                </a>
              </li>
              <li>
                <a
                  className={calendarOptionClass}
                  {...linkProps(
                    yahooCalendarUrl(calendar),
                    id,
                    "calendar-yahoo",
                  )}
                >
                  Yahoo Calendar
                </a>
              </li>
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}

registerBlock({
  type: "event",
  category: "content",
  label: "Event",
  description: "Date, time, venue and add-to-calendar links",
  icon: CalendarDays,
  schema: eventSchema,
  defaults: { title: "Launch party", timeZone: "UTC" },
  Render: EventBlock,
  Editor: EventEditor,
});
