import { cn } from "@repo/design-system/lib/utils";
import { Location as MapPin, Routing as Navigation } from "iconsax-reactjs";
import { z } from "zod";
import {
  addressSchema,
  buttonClass,
  formatAddress,
  lineText,
  linkProps,
  mapLinks,
  mutedTextClass,
} from "@/components/landing/block-kit";
import { type BlockRenderProps, registerBlock } from "../registry";
import { AddressMapEditor } from "./address-map-editor";

export const addressMapSchema = z.object({
  title: lineText(80).default(""),
  /** Business or venue name shown above the address */
  name: lineText(100).default(""),
  address: addressSchema.prefault({}),
  note: lineText(200).default(""),
  /** Embed a Google map (loads Google content on the page) */
  showMap: z.boolean().default(false),
});

export type AddressMapProps = z.output<typeof addressMapSchema>;

function AddressMapBlock({
  id,
  props,
  context,
}: BlockRenderProps<AddressMapProps>) {
  const lines = formatAddress(props.address);
  if (lines.length === 0) {
    return context.mode === "preview" ? (
      <p className="rounded-(--lp-radius) border-2 border-dashed border-current p-4 text-center text-sm opacity-40">
        Add an address
      </p>
    ) : null;
  }
  const query = [props.name, ...lines].filter(Boolean).join(", ");
  const maps = mapLinks(query);
  return (
    <section
      aria-label={props.title || "Location"}
      className="space-y-3 overflow-hidden rounded-(--lp-radius) bg-(--lp-muted) p-4"
    >
      {props.title && <h2 className="text-lg font-semibold">{props.title}</h2>}
      <div className="flex gap-3">
        <MapPin
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 opacity-70"
        />
        <address className="text-[15px] leading-relaxed not-italic">
          {props.name && (
            <span className="block font-medium">{props.name}</span>
          )}
          {lines.map((line) => (
            <span className="block" key={line}>
              {line}
            </span>
          ))}
          {props.note && (
            <span className={cn("mt-1 block text-sm", mutedTextClass)}>
              {props.note}
            </span>
          )}
        </address>
      </div>
      {props.showMap && (
        <iframe
          className="aspect-video w-full rounded-[calc(var(--lp-radius)*0.75)] border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={maps.embed}
          title={`Map of ${query}`}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <a
          className={buttonClass("filled", "min-h-11 text-sm")}
          {...linkProps(maps.google, id, "google-maps")}
        >
          <Navigation aria-hidden="true" className="size-4" />
          Google Maps
        </a>
        <a
          className={buttonClass("outline", "min-h-11 text-sm")}
          {...linkProps(maps.apple, id, "apple-maps")}
        >
          Apple Maps
        </a>
      </div>
    </section>
  );
}

export const addressMapBlock = registerBlock({
  type: "address-map",
  category: "contact",
  label: "Address & map",
  description: "Your address with directions in Google or Apple Maps",
  icon: MapPin,
  schema: addressMapSchema,
  defaults: {
    title: "Visit us",
    address: { street: "1 Market Street", city: "San Francisco", region: "CA" },
  },
  Render: AddressMapBlock,
  Editor: AddressMapEditor,
});
