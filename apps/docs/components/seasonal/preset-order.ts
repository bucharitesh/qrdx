import { getClientSeason } from "@/lib/seasonal";
import { CHRISTMAS_PRESET_IDS } from "./christmas-presets";
import { HALLOWEEN_PRESET_IDS } from "./halloween-presets";
import { NEW_YEAR_PRESET_IDS } from "./new-year-presets";

const SEASON_PRESETS: Record<string, readonly string[]> = {
  halloween: HALLOWEEN_PRESET_IDS,
  christmas: CHRISTMAS_PRESET_IDS,
  "new-year": NEW_YEAR_PRESET_IDS,
};

/** Moves the running season's presets to the front (client-side). */
export function seasonalPresetsFirst(names: string[]): string[] {
  const ids = SEASON_PRESETS[getClientSeason() ?? ""];
  if (!ids) return names;
  const seasonal = ids.filter((id) => names.includes(id));
  return [...seasonal, ...names.filter((name) => !seasonal.includes(name))];
}
