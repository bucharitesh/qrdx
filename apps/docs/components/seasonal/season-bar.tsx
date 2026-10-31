/** biome-ignore-all lint/security/noDangerouslySetInnerHtml: static pre-paint script, no user input */
"use client";

import { ArrowRight, Ghost, MagicStar, Tree } from "iconsax-reactjs";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getClientSeason,
  ringInYear,
  SEASON_OVERRIDE_STORAGE_KEY,
  SEASON_PARAM,
  type Season,
} from "@/lib/seasonal";
import { HalloweenPresetLink as PresetLink } from "./halloween-preset-link";
import { HALLOWEEN_PUMPKIN } from "./halloween-presets";
import { MIDNIGHT_EVENT } from "./new-year";

// Runs while the HTML streams in, before the bar paints, so a `?season=off`
// preview never flashes the bar in on a full page load.
const PRE_PAINT_SCRIPT = `(function(){try{var o=new URLSearchParams(location.search).get(${JSON.stringify(SEASON_PARAM)})||sessionStorage.getItem(${JSON.stringify(SEASON_OVERRIDE_STORAGE_KEY)});if(o==="off")document.documentElement.setAttribute("data-season-bar","off")}catch(e){}})()`;

const noopSubscribe = () => () => {};

/** Seasons with an announcement bar (winter has none). */
export type BarSeason = "halloween" | "christmas" | "new-year";
export const isBarSeason = (season: Season | null): season is BarSeason =>
  season === "halloween" || season === "christmas" || season === "new-year";

const LINK =
  "group inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

function Cta({
  preset,
  short,
  long,
}: {
  preset: string;
  short: string;
  long: string;
}) {
  return (
    <PresetLink preset={preset} className={LINK}>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
      <ArrowRight
        size={14}
        aria-hidden
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </PresetLink>
  );
}

const Dot = () => (
  <span aria-hidden className="text-muted-foreground">
    ·
  </span>
);

/** Live countdown to midnight on 1 January, in the visitor's local time. */
function Countdown({ year }: { year: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const target = new Date(year, 0, 1).getTime();
    let previous = Date.now();
    setNow(previous);
    const timer = window.setInterval(() => {
      const current = Date.now();
      // Only when midnight passes while the page is open.
      if (previous < target && current >= target) {
        window.dispatchEvent(new Event(MIDNIGHT_EVENT));
      }
      previous = current;
      setNow(current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [year]);
  if (now === null) return null;
  const left = Math.max(0, new Date(year, 0, 1).getTime() - now);
  if (left === 0) return null;
  const total = Math.floor(left / 1000);
  const days = Math.floor(total / 86_400);
  const pad = (value: number) => String(value).padStart(2, "0");
  const clock = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return (
    <span className="hidden items-center gap-2 sm:inline-flex">
      <Dot />
      <span className="text-muted-foreground tabular-nums">
        {days > 0 ? `${days}d ${clock}` : clock}
      </span>
    </span>
  );
}

function NewYearMessage() {
  const year = ringInYear();
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const check = () =>
      setArrived(Date.now() >= new Date(year, 0, 1).getTime());
    check();
    window.addEventListener(MIDNIGHT_EVENT, check);
    return () => window.removeEventListener(MIDNIGHT_EVENT, check);
  }, [year]);
  return (
    <>
      <MagicStar
        size={16}
        variant="Bulk"
        color="#C9A227"
        className="shrink-0"
        aria-hidden
      />
      <span className="truncate text-foreground/90">
        <span className="sm:hidden">
          {arrived ? `Happy ${year}` : `Ring in ${year}`}
        </span>
        <span className="hidden sm:inline">
          {arrived
            ? `Happy New Year ${year}`
            : `Ring in ${year} with New Year QR styles`}
        </span>
      </span>
      {!arrived && <Countdown year={year} />}
      <Dot />
      <Cta preset="newYearChampagne" short="Try one" long="Try one" />
    </>
  );
}

const MESSAGES: Record<BarSeason, () => ReactNode> = {
  halloween: () => (
    <>
      <Ghost
        size={16}
        variant="Bulk"
        color={HALLOWEEN_PUMPKIN}
        className="shrink-0"
        aria-hidden
      />
      <span className="truncate text-foreground/90">
        <span className="sm:hidden">Halloween QR styles</span>
        <span className="hidden sm:inline">Halloween QR styles are here</span>
      </span>
      <Dot />
      <Cta
        preset="halloweenPumpkin"
        short="Try one"
        long="Make a spooky QR code"
      />
    </>
  ),
  christmas: () => (
    <>
      <Tree
        size={16}
        variant="Bulk"
        color="#1F7A4D"
        className="shrink-0"
        aria-hidden
      />
      <span className="truncate text-foreground/90">
        <span className="sm:hidden">Christmas QR styles</span>
        <span className="hidden sm:inline">Christmas QR styles are here</span>
      </span>
      <Dot />
      <Cta
        preset="christmasCandyCane"
        short="Try one"
        long="Make a festive QR code"
      />
    </>
  ),
  "new-year": () => <NewYearMessage />,
};

const GLOW: Record<BarSeason, string> = {
  halloween:
    "bg-[radial-gradient(40%_160%_at_50%_0%,rgb(255_122_26/0.16),transparent_70%)]",
  christmas:
    "bg-[radial-gradient(40%_160%_at_50%_0%,rgb(200_40_60/0.12),transparent_70%)]",
  "new-year":
    "bg-[radial-gradient(40%_160%_at_50%_0%,rgb(201_162_39/0.16),transparent_70%)]",
};

/** A thin cap of settled snow along the bar's bottom edge. */
function SnowLedge() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 6"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 -bottom-px h-1 w-full text-slate-200 dark:text-white/45"
    >
      <path
        d="M0 6V3q20-3 40 0t40 0 40-1 40 1 40 0 40-2 40 2 40 0 40-1 40 1 40 0 40-2 40 2 40 0 40-1 40 1 40 0 40-2 40 2 40 0 40-1 40 1 40 0 40-2 40 2 40 0 40-1 40 1 40 0 40-2 40 2 40 0V6Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Slim, seasonal announcement for the marketing layout (Halloween, Christmas, New Year). */
export function SeasonBar({
  serverSeason,
}: {
  serverSeason: BarSeason | null;
}) {
  const [season, setSeason] = useState<BarSeason | null>(serverSeason);
  // True only while hydrating server HTML, so the script is never created client-side.
  const hydrating = useSyncExternalStore(
    noopSubscribe,
    () => false,
    () => true,
  );
  // Layout effect: decide before paint on client navigations and previews.
  useLayoutEffect(() => {
    const next = getClientSeason();
    setSeason(isBarSeason(next) ? next : null);
  }, []);

  return (
    <>
      {hydrating && serverSeason && (
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      )}
      {season && (
        <aside
          aria-label="Seasonal QR styles"
          className="relative border-b [html[data-season-bar=off]_&]:hidden"
        >
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 overflow-hidden ${GLOW[season]}`}
          />
          <div className="relative flex h-10 items-center justify-center gap-2 px-6 text-sm sm:px-40">
            {MESSAGES[season]()}
          </div>
          {season === "christmas" && <SnowLedge />}
        </aside>
      )}
    </>
  );
}
