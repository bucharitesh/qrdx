"use client";

import dynamic from "next/dynamic";
import { hasSnow } from "@/lib/seasonal";
import { Snowfall } from "./snowfall";
import { useActiveSeason } from "./use-season";

// Each season's cast (motion, QR art, sprites) loads only while that season
// runs, so the rest of the year marketing pages ship none of it. The season
// is known only after mount anyway (useActiveSeason), so nothing renders on
// the server either way.
const HalloweenSiteCharacters = dynamic(
  () => import("./site-characters").then((m) => m.HalloweenSiteCharacters),
  { ssr: false },
);
const ChristmasCharacters = dynamic(
  () => import("./christmas").then((m) => m.ChristmasCharacters),
  { ssr: false },
);
const NewYearCharacters = dynamic(
  () => import("./new-year").then((m) => m.NewYearCharacters),
  { ssr: false },
);

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
