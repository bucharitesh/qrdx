"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Globe } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Links between UTC and the viewer's time zone (`?tz=`), keeping other params. */
export function TimeZoneSwitch({
  path,
  params,
  current,
}: {
  path: string;
  /** Other query params of the page (without tz) */
  params: Record<string, string>;
  current: string;
}) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    setLocal(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
  }, []);

  const href = (timeZone: string | null) => {
    const search = new URLSearchParams(params);
    if (timeZone && timeZone !== "UTC") search.set("tz", timeZone);
    const query = search.toString();
    return query ? `${path}?${query}` : path;
  };

  if (current !== "UTC") {
    return (
      <Button asChild size="sm" variant="ghost">
        <Link href={href(null)} scroll={false}>
          <Globe />
          {current} · show UTC
        </Link>
      </Button>
    );
  }
  if (!local || local === "UTC") return null;
  return (
    <Button asChild size="sm" variant="ghost">
      <Link href={href(local)} scroll={false}>
        <Globe />
        UTC · show {local}
      </Link>
    </Button>
  );
}
