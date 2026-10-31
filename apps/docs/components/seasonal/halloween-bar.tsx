import { getActiveSeason } from "@/lib/seasonal";
import { HalloweenBarClient } from "./halloween-bar-client";
import { HalloweenSiteCharacters } from "./site-characters";

/** Marketing layout: slim Halloween announcement plus the interactive characters. */
export function HalloweenBar() {
  return (
    <>
      <HalloweenBarClient serverActive={getActiveSeason() === "halloween"} />
      <HalloweenSiteCharacters />
    </>
  );
}
