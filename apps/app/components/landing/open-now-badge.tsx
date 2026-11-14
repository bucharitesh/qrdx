"use client";

import { useEffect, useState } from "react";
import { fillText } from "./fill-text";
import {
  type DayHours,
  type OpenStatus,
  openStatus,
  weekdayNames,
} from "./opening-hours";

/** The badge's words: templates with {time} and {day}, from the hours block. */
export interface OpenNowText {
  /** "Open now · until {time}" */
  openUntil: string;
  /** "Closed · opens {day} {time}" */
  closedOpens: string;
  closed: string;
}

/** "Open now · until 17:00" in the place's time zone (computed after mount). */
export function OpenNowBadge({
  week,
  timeZone,
  locale,
  text,
}: {
  week: DayHours[];
  timeZone: string;
  /** For the day's short name ("Mon", "月") */
  locale: string;
  text: OpenNowText;
}) {
  const [status, setStatus] = useState<OpenStatus | null>(null);

  useEffect(() => {
    const update = () => setStatus(openStatus(week, timeZone));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [week, timeZone]);

  if (!status) return <span className="h-6" />;
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${status.open ? "bg-emerald-500" : "bg-red-500"}`}
      />
      {status.open
        ? fillText(text.openUntil, { time: status.closesAt })
        : status.opensAt
          ? fillText(text.closedOpens, {
              day: weekdayNames(locale, "short")[status.opensAt.day] ?? "",
              time: status.opensAt.time,
            })
          : text.closed}
    </span>
  );
}
