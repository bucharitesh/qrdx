"use client";

import { Tick } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  Calendar,
  Call,
  DocumentText,
  GalleryAdd,
  type Icon,
  Link21,
  Location,
  Sms,
  Wifi,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  BrandLogo,
  type BrandMarkSlug,
  brandMark,
} from "@/lib/brand-logos/brand-logo";
import {
  brandQuickIconDataUrl,
  logoMarkerOf,
  logoTitleOf,
} from "@/lib/brand-logos/svg";
import { soundEvent } from "@/lib/sound/emit";

type LogoIcon = { id: string; name: string } & (
  | { Glyph: Icon; brand?: never }
  | { brand: BrandMarkSlug; Glyph?: never }
);

/**
 * Icons for the most common code types: iconsax glyphs for the generic ones,
 * the real marks (Simple Icons) for brands. Same ids as LOGO_ICON_IDS
 * (lib/qr-design/style.ts) and the server's copy (lib/qr-design/logo.ts).
 */
const LOGO_ICONS: LogoIcon[] = [
  { id: "wifi", name: "Wi-Fi", Glyph: Wifi },
  { id: "location", name: "Location", Glyph: Location },
  { id: "phone", name: "Phone", Glyph: Call },
  { id: "email", name: "Email", Glyph: Sms },
  { id: "link", name: "Link", Glyph: Link21 },
  { id: "file", name: "PDF or file", Glyph: DocumentText },
  { id: "calendar", name: "Calendar", Glyph: Calendar },
  { id: "whatsapp", name: "WhatsApp", brand: "whatsapp" },
  { id: "instagram", name: "Instagram", brand: "instagram" },
];

const GLYPH_COLOR = "#111111";
const MARKER = "data-qrdx-icon";

/**
 * Wraps a rendered iconsax glyph in a white rounded tile and returns it as an
 * SVG data URL, the same format an uploaded logo is stored in.
 */
function toLogoDataUrl(glyph: SVGSVGElement, id: string): string {
  const viewBox = glyph.getAttribute("viewBox") ?? "0 0 24 24";
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" ${MARKER}="${id}"><rect width="96" height="96" rx="22" fill="#ffffff"/><svg x="18" y="18" width="60" height="60" viewBox="${viewBox}" fill="none">${glyph.innerHTML}</svg></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

/** The quick icon a logo was made from, if any. */
function logoIcon(logo: string | undefined): LogoIcon | null {
  if (!logo?.startsWith("data:image/svg+xml,")) return null;
  return (
    LOGO_ICONS.find((item) =>
      logo.includes(encodeURIComponent(`${MARKER}="${item.id}"`)),
    ) ?? null
  );
}

/** Name of the quick icon a logo was made from, if any. */
export function logoIconName(logo: string | undefined): string | null {
  return logoIcon(logo)?.name ?? null;
}

/** Id of the quick icon a logo was made from ("wifi"), if any. */
export function logoIconId(logo: string | undefined): string | null {
  return logoIcon(logo)?.id ?? null;
}

/** The quick icons' ids, in the picker's order. */
export const QUICK_ICON_IDS = LOGO_ICONS.map((icon) => icon.id);

/**
 * A quick icon as the data URL picking its tile stores, without the tile
 * on screen (the preview's Random logo). Browser only: the glyph is drawn
 * into a detached node to read its markup.
 */
export function quickIconDataUrl(id: string): string | null {
  const icon = LOGO_ICONS.find((item) => item.id === id);
  if (!icon) return null;
  if (icon.brand) return brandQuickIconDataUrl(brandMark(icon.brand), id);
  const { Glyph } = icon;
  if (!Glyph) return null;
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(<Glyph color={GLYPH_COLOR} variant="Bold" />));
  const glyph = host.querySelector("svg");
  const url = glyph ? toLogoDataUrl(glyph, id) : null;
  root.unmount();
  return url;
}

/** Name of the brand a gallery logo shows ("Spotify"), if it is one. */
export function brandLogoName(logo: string | undefined): string | null {
  return logoMarkerOf(logo)?.includes(":") ? logoTitleOf(logo) : null;
}

const tileClass =
  "group bg-card relative grid aspect-square min-w-0 place-items-center rounded-lg border p-1 transition-[background-color,border-color,transform] outline-none active:scale-[0.97] hover:border-foreground/20 hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-ring/40 focus-visible:ring-[3px]";

interface LogoPresetsProps {
  /** Current logo (data URL or URL) */
  logo: string | undefined;
  /** Logo shown in the code right now */
  active: boolean;
  onPick: (dataUrl: string) => void;
  onUpload: () => void;
}

/** Quick icons drawn on a white tile, plus "Your logo" (upload). */
export function LogoPresets({
  logo,
  active,
  onPick,
  onUpload,
}: LogoPresetsProps) {
  const t = useTranslations("editor.controlSections.logoPresets");
  const current = active ? logoIconName(logo) : null;

  return (
    <fieldset
      aria-label={t("quickLogoIcons")}
      className="m-0 grid max-w-[17.5rem] min-w-0 grid-cols-5 gap-2 border-0 p-0"
    >
      {LOGO_ICONS.map(({ id, name, Glyph, brand }) => {
        const selected = current === name;
        return (
          <button
            aria-label={t("nameIcon", { name })}
            aria-pressed={selected}
            className={cn(
              tileClass,
              selected &&
                "border-foreground/40 bg-accent/60 hover:border-foreground/40",
            )}
            key={id}
            onClick={(event) => {
              if (brand) {
                onPick(brandQuickIconDataUrl(brandMark(brand), id));
              } else {
                const glyph = event.currentTarget.querySelector("svg");
                if (!glyph) return;
                onPick(toLogoDataUrl(glyph, id));
              }
              soundEvent("tick");
            }}
            title={name}
            type="button"
          >
            <span className="grid size-full place-items-center rounded-[9px] bg-white ring-1 ring-black/5">
              {brand ? (
                // The same share of the tile as in the QR logo (52 of 96)
                <BrandLogo className="size-[54%]" slug={brand} />
              ) : Glyph ? (
                <Glyph
                  className="size-[58%]"
                  color={GLYPH_COLOR}
                  variant="Bold"
                />
              ) : null}
            </span>
            {selected && (
              <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full shadow-sm">
                <Tick className="size-3" />
              </span>
            )}
          </button>
        );
      })}
      <button
        aria-label={t("uploadYourLogo")}
        className={cn(tileClass, "border-dashed")}
        onClick={onUpload}
        title={t("yourLogo")}
        type="button"
      >
        <GalleryAdd className="text-muted-foreground group-hover:text-foreground size-5 transition-colors" />
      </button>
    </fieldset>
  );
}
