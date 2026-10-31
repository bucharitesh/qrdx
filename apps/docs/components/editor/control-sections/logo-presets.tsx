"use client";

import { Tick } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  Calendar,
  Call,
  DocumentText,
  GalleryAdd,
  type Icon,
  Instagram,
  Link21,
  Location,
  Sms,
  Whatsapp,
  Wifi,
} from "iconsax-reactjs";
import { soundEvent } from "@/lib/sound/emit";

interface LogoIcon {
  id: string;
  name: string;
  Glyph: Icon;
}

/** Icons for the most common code types. */
const LOGO_ICONS: LogoIcon[] = [
  { id: "wifi", name: "Wi-Fi", Glyph: Wifi },
  { id: "location", name: "Location", Glyph: Location },
  { id: "phone", name: "Phone", Glyph: Call },
  { id: "email", name: "Email", Glyph: Sms },
  { id: "link", name: "Link", Glyph: Link21 },
  { id: "file", name: "PDF or file", Glyph: DocumentText },
  { id: "calendar", name: "Calendar", Glyph: Calendar },
  { id: "whatsapp", name: "WhatsApp", Glyph: Whatsapp },
  { id: "instagram", name: "Instagram", Glyph: Instagram },
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

/** Name of the quick icon a logo was made from, if any. */
export function logoIconName(logo: string | undefined): string | null {
  if (!logo?.startsWith("data:image/svg+xml,")) return null;
  const icon = LOGO_ICONS.find((item) =>
    logo.includes(encodeURIComponent(`${MARKER}="${item.id}"`)),
  );
  return icon ? icon.name : null;
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
  const current = active ? logoIconName(logo) : null;

  return (
    <fieldset
      aria-label="Quick logo icons"
      className="m-0 grid max-w-[17.5rem] min-w-0 grid-cols-5 gap-2 border-0 p-0"
    >
      {LOGO_ICONS.map(({ id, name, Glyph }) => {
        const selected = current === name;
        return (
          <button
            aria-label={`${name} icon`}
            aria-pressed={selected}
            className={cn(
              tileClass,
              selected &&
                "border-foreground/40 bg-accent/60 hover:border-foreground/40",
            )}
            key={id}
            onClick={(event) => {
              const glyph = event.currentTarget.querySelector("svg");
              if (!glyph) return;
              onPick(toLogoDataUrl(glyph, id));
              soundEvent("tick");
            }}
            title={name}
            type="button"
          >
            <span className="grid size-full place-items-center rounded-[9px] bg-white ring-1 ring-black/5">
              <Glyph
                className="size-[58%]"
                color={GLYPH_COLOR}
                variant="Bold"
              />
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
        aria-label="Upload your logo"
        className={cn(tileClass, "border-dashed")}
        onClick={onUpload}
        title="Your logo"
        type="button"
      >
        <GalleryAdd className="text-muted-foreground group-hover:text-foreground size-5 transition-colors" />
      </button>
    </fieldset>
  );
}
