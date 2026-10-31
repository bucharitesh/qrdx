"use client";

import { hasSnow } from "@/lib/seasonal";
import { ChristmasCharacters } from "./christmas";
import { NewYearCharacters } from "./new-year";
import { HalloweenSiteCharacters } from "./site-characters";
import { Snowfall } from "./snowfall";
import { useActiveSeason } from "./use-season";

/** Marketing pages: the running season's characters (and winter's light snow). */
export function SeasonCharacters() {
  const season = useActiveSeason();
  return (
    <>
      {hasSnow(season) && <Snowfall count={season === "winter" ? 40 : 28} />}
      {season === "halloween" && <HalloweenSiteCharacters />}
      {season === "christmas" && <ChristmasCharacters />}
      {season === "new-year" && <NewYearCharacters />}
    </>
  );
}
