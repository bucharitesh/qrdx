"use client";

import { useEffect, useState } from "react";
import { getClientSeason, type Season } from "@/lib/seasonal";

/** The running season (date plus `?season=` preview). Null on the server and first render. */
export function useActiveSeason(): Season | null {
  const [season, setSeason] = useState<Season | null>(null);
  useEffect(() => {
    setSeason(getClientSeason());
  }, []);
  return season;
}
