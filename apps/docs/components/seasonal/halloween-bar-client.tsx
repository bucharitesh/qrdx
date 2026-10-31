/** biome-ignore-all lint/security/noDangerouslySetInnerHtml: static pre-paint script, no user input */
"use client";

import { ArrowRight, Ghost } from "iconsax-reactjs";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { SEASON_OVERRIDE_STORAGE_KEY, SEASON_PARAM } from "@/lib/seasonal";
import { HalloweenPresetLink } from "./halloween-preset-link";
import { HALLOWEEN_PUMPKIN } from "./halloween-presets";
import {
  HALLOWEEN_HIDDEN_KEY,
  isHalloweenOn,
  subscribeHalloween,
} from "./use-halloween";

// Runs while the HTML streams in, before the bar paints, so a hidden bar
// (or a `?season=off` preview) never flashes in on a full page load.
const PRE_PAINT_SCRIPT = `(function(){try{var o=new URLSearchParams(location.search).get(${JSON.stringify(SEASON_PARAM)})||sessionStorage.getItem(${JSON.stringify(SEASON_OVERRIDE_STORAGE_KEY)});if(o==="off"||localStorage.getItem(${JSON.stringify(HALLOWEEN_HIDDEN_KEY)}))document.documentElement.setAttribute("data-halloween-bar","off")}catch(e){}})()`;

const noopSubscribe = () => () => {};

export function HalloweenBarClient({
  serverActive,
}: {
  serverActive: boolean;
}) {
  const [visible, setVisible] = useState(serverActive);
  // True only while hydrating server HTML, so the script is never created client-side.
  const hydrating = useSyncExternalStore(
    noopSubscribe,
    () => false,
    () => true,
  );

  // Layout effect: decide before paint on client navigations.
  useLayoutEffect(() => {
    const update = () => setVisible(isHalloweenOn());
    update();
    return subscribeHalloween(update);
  }, []);

  return (
    <>
      {hydrating && serverActive && (
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      )}
      {visible && (
        <aside
          aria-label="Halloween"
          className="relative overflow-hidden border-b [html[data-halloween-bar=off]_&]:hidden"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_160%_at_50%_0%,rgb(255_122_26/0.16),transparent_70%)]"
          />
          <div className="relative flex h-10 items-center justify-center gap-2 pr-14 pl-10 text-sm sm:px-40">
            <Ghost
              size={16}
              variant="Bulk"
              color={HALLOWEEN_PUMPKIN}
              className="shrink-0"
              aria-hidden
            />
            <span className="truncate text-foreground/90">
              <span className="sm:hidden">Halloween QR styles</span>
              <span className="hidden sm:inline">
                Halloween QR styles are here
              </span>
            </span>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <HalloweenPresetLink className="group inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline decoration-[#FF7A1A]/50 underline-offset-4 transition-colors hover:decoration-[#FF7A1A]">
              <span className="sm:hidden">Try one</span>
              <span className="hidden sm:inline">Make a spooky QR code</span>
              <ArrowRight
                size={14}
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </HalloweenPresetLink>
          </div>
        </aside>
      )}
    </>
  );
}
