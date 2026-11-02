import { getActiveSeason } from "@/lib/seasonal";
import { SeasonBar } from "./season-bar";

export { SeasonCharacters } from "./season-characters";

/**
 * Marketing layout: the season's slim announcement. Its characters
 * (SeasonCharacters) go last in the layout, so their buttons come after the
 * page in tab order. Dormant outside the windows.
 */
export function SeasonalLayer() {
  const season = getActiveSeason();
  return (
    <SeasonBar
      serverSeason={
        season === "halloween" ||
        season === "christmas" ||
        season === "new-year"
          ? season
          : null
      }
    />
  );
}
