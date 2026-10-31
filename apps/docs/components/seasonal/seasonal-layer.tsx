import { getActiveSeason } from "@/lib/seasonal";
import { SeasonBar } from "./season-bar";
import { SeasonCharacters } from "./season-characters";

/** Marketing layout: the season's slim announcement plus its characters. Dormant outside the windows. */
export function SeasonalLayer() {
  const season = getActiveSeason();
  return (
    <>
      <SeasonBar
        serverSeason={
          season === "halloween" ||
          season === "christmas" ||
          season === "new-year"
            ? season
            : null
        }
      />
      <SeasonCharacters />
    </>
  );
}
