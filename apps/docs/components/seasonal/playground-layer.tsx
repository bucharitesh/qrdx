"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Ghost, MagicStar, Tree } from "iconsax-reactjs";
import type { ColorConfig } from "qrdx/types";
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { track } from "@/lib/analytics";
import type { Season } from "@/lib/seasonal";
import { useQREditorStore } from "@/store/editor-store";
import type { ThemePreset } from "@/types/theme";
import { type AvoidRects, SittingCat } from "./cat";
import { Snowman } from "./christmas";
import { christmasPresets } from "./christmas-presets";
import { FloatGhost, type GhostPlacement } from "./ghost";
import { SpiderWeb } from "./glyphs";
import { HALLOWEEN_PUMPKIN, halloweenPresets } from "./halloween-presets";
import { HalloweenHeaderChrome } from "./header-chrome";
import { Champagne } from "./new-year";
import { newYearPresets } from "./new-year-presets";
import styles from "./seasonal.module.css";
import { useActiveSeason } from "./use-season";

const GHOST_RATIO = 512 / 431;

type CanvasSeason = "halloween" | "christmas" | "new-year";

const CHIPS: Record<
  CanvasSeason,
  {
    title: string;
    icon: ReactNode;
    presets: Record<string, ThemePreset>;
    chips: { id: string; label: string }[];
  }
> = {
  halloween: {
    title: "Try a spooky style",
    icon: (
      <Ghost size={14} variant="Bulk" color={HALLOWEEN_PUMPKIN} aria-hidden />
    ),
    presets: halloweenPresets,
    chips: [
      { id: "halloweenPumpkin", label: "Pumpkin" },
      { id: "halloweenGhost", label: "Ghost" },
      { id: "halloweenPotion", label: "Potion" },
      { id: "halloweenBatNight", label: "Bat night" },
    ],
  },
  christmas: {
    title: "Try a festive style",
    icon: <Tree size={14} variant="Bulk" color="#1F7A4D" aria-hidden />,
    presets: christmasPresets,
    chips: [
      { id: "christmasCandyCane", label: "Candy Cane" },
      { id: "christmasPine", label: "Pine" },
      { id: "christmasSnowfall", label: "Snowfall" },
      { id: "christmasGoldStar", label: "Gold Star" },
    ],
  },
  "new-year": {
    title: "Try a New Year style",
    icon: <MagicStar size={14} variant="Bulk" color="#C9A227" aria-hidden />,
    presets: newYearPresets,
    chips: [
      { id: "newYearChampagne", label: "Champagne" },
      { id: "newYearMidnight", label: "Midnight" },
      { id: "newYearStarlight", label: "Starlight" },
      { id: "newYearSparklerGold", label: "Sparkler Gold" },
    ],
  },
};

function solid(color: ColorConfig | string | undefined, fallback: string) {
  if (!color) return fallback;
  if (typeof color === "string") return color;
  if ("stops" in color) return color.stops[0]?.color ?? fallback;
  return "color" in color ? color.color : fallback;
}

/** The preview canvas: the first positioned element down the preview panel. */
function findCanvas(main: HTMLElement): HTMLElement | null {
  const panel =
    main.querySelector<HTMLElement>(
      '[data-slot="resizable-panel-group"] > [data-slot="resizable-panel"]:last-child',
    ) ??
    main.querySelector<HTMLElement>(
      '[data-slot="tabs-content"][data-state="active"][id$="-content-preview"]',
    );
  let el = panel?.lastElementChild as HTMLElement | null | undefined;
  for (let depth = 0; el && depth < 6; depth++) {
    if (getComputedStyle(el).position === "relative") return el;
    el = el.lastElementChild as HTMLElement | null;
  }
  return null;
}

function useLayerIn(
  canvas: HTMLElement,
  where: "first" | "last",
  className: string,
) {
  const [layer] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    layer.className = className;
    layer.setAttribute("aria-hidden", "true");
    if (where === "first") canvas.insertBefore(layer, canvas.firstChild);
    else canvas.appendChild(layer);
    return () => layer.remove();
  }, [canvas, layer, where, className]);
  return layer;
}

function SeasonChips({
  season,
  chipsRef,
}: {
  season: CanvasSeason;
  chipsRef: Ref<HTMLDivElement>;
}) {
  const preset = useQREditorStore((state) => state.themeState.preset);
  const applyThemePreset = useQREditorStore((state) => state.applyThemePreset);
  const config = CHIPS[season];

  return (
    <div
      ref={chipsRef}
      className="pointer-events-auto absolute top-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none]"
    >
      <span className="flex shrink-0 items-center gap-1.5 pr-1 pl-1 text-xs text-muted-foreground">
        {config.icon}
        <span className="hidden sm:inline">{config.title}</span>
      </span>
      {config.chips.map((chip) => {
        const look = config.presets[chip.id].styles;
        const active = preset === chip.id;
        return (
          <Button
            key={chip.id}
            size="sm"
            variant={active ? "secondary" : "outline"}
            aria-pressed={active}
            onClick={() => {
              applyThemePreset(chip.id);
              track("theme_applied", { method: "preset", preset: chip.id });
            }}
          >
            <span
              aria-hidden
              className="size-3 rounded-full ring-1 ring-border"
              style={{
                background: `linear-gradient(135deg, ${solid(look.fgColor, "#000")} 50%, ${solid(look.bgColor, "#fff")} 50%)`,
              }}
            />
            {chip.label}
          </Button>
        );
      })}
    </div>
  );
}

function CanvasLayers({
  canvas,
  season,
}: {
  canvas: HTMLElement;
  season: CanvasSeason;
}) {
  const back = useLayerIn(
    canvas,
    "first",
    "pointer-events-none absolute inset-0 overflow-hidden",
  );
  const front = useLayerIn(
    canvas,
    "last",
    "pointer-events-none absolute inset-0 z-[5] overflow-hidden select-none",
  );
  const chipsRef = useRef<HTMLDivElement>(null);

  // Everything the characters must stay off: the QR (or empty-state message), the scan badge, the chips.
  const avoid: AvoidRects = useCallback(() => {
    const box = canvas.getBoundingClientRect();
    const rects: DOMRect[] = [];
    for (const child of canvas.children) {
      if (child === back || child === front) continue;
      const rect = child.getBoundingClientRect();
      if (rect.width * rect.height < box.width * box.height * 0.8) {
        rects.push(rect);
        continue;
      }
      // Full-size wrapper: use the bounds of what it actually shows.
      const content = [...child.querySelectorAll("svg, canvas, img, h3, p")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      if (content.length === 0) continue;
      const left = Math.min(...content.map((r) => r.left));
      const top = Math.min(...content.map((r) => r.top));
      const right = Math.max(...content.map((r) => r.right));
      const bottom = Math.max(...content.map((r) => r.bottom));
      rects.push(new DOMRect(left, top, right - left, bottom - top));
    }
    const chips = chipsRef.current?.getBoundingClientRect();
    if (chips) rects.push(chips);
    return rects.filter((rect) => rect.width > 0 && rect.height > 0);
  }, [canvas, back, front]);

  // Ghost floats in a free corner of the canvas (bottom-left, else top-right).
  const ghostPlacement: GhostPlacement = useCallback(
    (size) => {
      const box = front.getBoundingClientRect();
      const height = size * GHOST_RATIO;
      const blocks = avoid();
      const spots = [
        { x: 28, y: box.height - height - 64 },
        { x: box.width - size - 36, y: 72 },
      ];
      return (
        spots.find((spot) => {
          // Room for the figure-8 and a little flee distance.
          const area = new DOMRect(
            box.left + spot.x - 30,
            box.top + spot.y - 24,
            size + 60,
            height + 48,
          );
          return (
            spot.y > 48 &&
            !blocks.some(
              (block) =>
                area.left < block.right &&
                area.right > block.left &&
                area.top < block.bottom &&
                area.bottom > block.top,
            )
          );
        }) ?? null
      );
    },
    [front, avoid],
  );

  return (
    <>
      {season === "halloween" &&
        createPortal(
          <>
            <div className={styles.fog} style={{ left: "-10%" }} />
            <div
              className={styles.fog}
              style={{ left: "35%", "--delay": "-9s" } as CSSProperties}
            />
          </>,
          back,
        )}
      {createPortal(
        <>
          <SeasonChips season={season} chipsRef={chipsRef} />
          {season === "halloween" && (
            <>
              <SpiderWeb className="absolute top-0 right-0 size-11 -scale-x-100 text-foreground/15" />
              <FloatGhost placement={ghostPlacement} size={40} />
              <SittingCat stage={front} avoid={avoid} right={14} size={44} />
            </>
          )}
          {season === "christmas" && (
            <Snowman
              style={{ right: 18, bottom: 8 }}
              width={34}
              avoid={avoid}
            />
          )}
          {season === "new-year" && (
            <Champagne
              style={{ right: 20, bottom: 8 }}
              width={20}
              avoid={avoid}
            />
          )}
        </>,
        front,
      )}
    </>
  );
}

function SeasonCanvas({ season }: { season: CanvasSeason }) {
  const [canvas, setCanvas] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    // The editor swaps panels (desktop/mobile, tabs); follow the live canvas.
    let frame = 0;
    const update = () => {
      frame = 0;
      setCanvas(findCanvas(main));
    };
    update();
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(update);
    });
    observer.observe(main, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  if (!canvas) return null;
  return <CanvasLayers canvas={canvas} season={season} />;
}

const isCanvasSeason = (season: Season | null): season is CanvasSeason =>
  season === "halloween" || season === "christmas" || season === "new-year";

/**
 * Playground: the season's preset chips and a character or two at the edges
 * of the preview canvas (Halloween also gets its header spider and fog).
 * Winter adds nothing here.
 */
export function SeasonalPlayground() {
  const season = useActiveSeason();
  if (!isCanvasSeason(season)) return null;
  return (
    <>
      {season === "halloween" && <HalloweenHeaderChrome spider />}
      <SeasonCanvas season={season} />
    </>
  );
}
