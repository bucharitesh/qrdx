import { getClientSeason } from "@/lib/seasonal";
import { HALLOWEEN_PRESET_IDS } from "./halloween-presets";

/** Moves the Halloween presets to the front while Halloween runs (client-side). */
export function seasonalPresetsFirst(names: string[]): string[] {
  if (getClientSeason() !== "halloween") return names;
  const seasonal: string[] = HALLOWEEN_PRESET_IDS.filter((id) =>
    names.includes(id),
  );
  return [...seasonal, ...names.filter((name) => !seasonal.includes(name))];
}
