import { cn } from "@repo/design-system/lib/utils";
import { Link2 } from "lucide-react";
import { z } from "zod";
import {
  buttonClass,
  imageSchema,
  itemIdSchema,
  lineText,
  linkProps,
  linkUrlSchema,
} from "@/components/landing/block-kit";
import { networkForUrl } from "@/components/landing/social-networks";
import { type BlockRenderProps, registerBlock } from "../registry";
import { BUTTON_STYLES } from "./button";
import { LinksEditor } from "./links-editor";

export const MAX_LINKS = 50;

export const linkItemSchema = z.object({
  id: itemIdSchema,
  label: lineText(80).min(1, "Add a label for every link"),
  url: linkUrlSchema,
  description: lineText(140).default(""),
  thumbnail: imageSchema.optional(),
  /** Highlighted with the accent color */
  featured: z.boolean().default(false),
});

export const linksSchema = z.object({
  title: lineText(80).default(""),
  items: z.array(linkItemSchema).max(MAX_LINKS).default([]),
  style: z.enum(BUTTON_STYLES).default("soft"),
  /** Show the network icon for known sites (Instagram, YouTube, ...) */
  icons: z.boolean().default(true),
});

export type LinksProps = z.output<typeof linksSchema>;
export type LinkItem = LinksProps["items"][number];

function LinksBlock({ id, props }: BlockRenderProps<LinksProps>) {
  if (props.items.length === 0) return null;
  return (
    <nav aria-label={props.title || "Links"} className="space-y-3">
      {props.title && (
        <h2 className="text-center text-sm font-semibold tracking-wide uppercase opacity-80">
          {props.title}
        </h2>
      )}
      <ul className="space-y-3">
        {props.items.map((item) => {
          const network = props.icons ? networkForUrl(item.url) : null;
          const Icon = network?.icon;
          const leading = item.thumbnail ? (
            <img
              alt={item.thumbnail.alt}
              className="size-10 shrink-0 rounded-[calc(var(--lp-radius)*0.6)] object-cover"
              decoding="async"
              height={40}
              loading="lazy"
              src={item.thumbnail.url}
              width={40}
            />
          ) : Icon ? (
            <Icon aria-hidden="true" className="size-5 shrink-0" />
          ) : null;
          return (
            <li key={item.id}>
              <a
                className={cn(
                  buttonClass(item.featured ? "filled" : props.style),
                  "relative",
                  leading && "px-14",
                )}
                {...linkProps(item.url, id, item.id)}
              >
                {leading && (
                  <span className="absolute top-1/2 left-1.5 flex size-10 -translate-y-1/2 items-center justify-center">
                    {leading}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block break-words">{item.label}</span>
                  {item.description && (
                    <span className="block text-[13px] font-normal opacity-75">
                      {item.description}
                    </span>
                  )}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const linksBlock = registerBlock({
  type: "links",
  category: "links",
  label: "Link list",
  description: "A stack of buttons to your sites, shop and socials",
  icon: Link2,
  schema: linksSchema,
  defaults: {
    items: [{ id: "link1", label: "My website", url: "https://example.com" }],
  },
  Render: LinksBlock,
  Editor: LinksEditor,
});
