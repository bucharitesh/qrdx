"use client";

import { useEffect, useState } from "react";
import {
  type DayHours,
  type OpenStatus,
  openStatus,
  WEEKDAYS,
} from "./opening-hours";

/** "Open now · until 17:00" in the place's time zone (computed after mount). */
export function OpenNowBadge({
  week,
  timeZone,
}: {
  week: DayHours[];
  timeZone: string;
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
        ? `Open now · until ${status.closesAt}`
        : status.opensAt
          ? `Closed · opens ${WEEKDAYS[status.opensAt.day]?.slice(0, 3)} ${status.opensAt.time}`
          : "Closed"}
    </span>
  );
}
