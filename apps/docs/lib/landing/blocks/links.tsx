import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, Link2 } from "iconsax-reactjs";
import { z } from "zod";
import {
  buttonClass,
  buttonShapeClass,
  imageSchema,
  itemIdSchema,
  lineText,
  linkProps,
  linkUrlSchema,
  mutedTextClass,
} from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import { networkForUrl } from "@/components/landing/social-networks";
import { smallTemplatePhoto } from "@/lib/landing/templates/media";
import {
  type BlockRenderContext,
  type BlockRenderProps,
  registerBlock,
} from "../registry";
import { BUTTON_STYLES } from "./button";
import { LinksEditor } from "./links-editor";

export const MAX_LINKS = 50;

/** Button styles plus "rows": a hairline list with an arrow, no buttons. */
export const LINK_STYLES = [...BUTTON_STYLES, "rows"] as const;

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
  style: z.enum(LINK_STYLES).default("soft"),
  /** Show the network icon for known sites (Instagram, YouTube, ...) */
  icons: z.boolean().default(true),
  /** list: one link per row; grid: two columns of image tiles */
  layout: z.enum(["list", "grid"]).default("list"),
});

export type LinksProps = z.output<typeof linksSchema>;
export type LinkItem = LinksProps["items"][number];

function Thumbnail({
  item,
  className,
  lead,
}: {
  item: LinkItem;
  className: string;
  /**
   * In the page's lead row (LandingRender): "high" loads eagerly and first,
   * "eager" just doesn't wait for layout. Otherwise lazy.
   */
  lead?: "high" | "eager";
}) {
  if (!item.thumbnail) return null;
  return (
    <img
      alt={item.thumbnail.alt}
      className={className}
      decoding="async"
      fetchPriority={lead === "high" ? "high" : undefined}
      loading={lead ? undefined : "lazy"}
      // Tiles are a few hundred pixels at most: template photos come with a
      // half-size copy that is still sharp there (other URLs are unchanged).
      src={smallTemplatePhoto(item.thumbnail.url)}
    />
  );
}

function ItemText({ item }: { item: LinkItem }) {
  return (
    <span className="min-w-0">
      <span className="block break-words">{item.label}</span>
      {item.description && (
        <span className="block text-[13px] font-normal opacity-75">
          {item.description}
        </span>
      )}
    </span>
  );
}

/** Ids of the grid's first row with a thumbnail (a featured tile fills a row). */
function firstRow(items: LinkItem[]): string[] {
  const [first, second] = items;
  const row = first?.featured || second?.featured ? [first] : [first, second];
  return row.flatMap((item) => (item?.thumbnail ? [item.id] : []));
}

/** Two columns of tiles: the thumbnail on top, the label under it. */
function LinkGrid({
  id,
  props,
  context,
}: {
  id: string;
  props: LinksProps;
  context: BlockRenderContext;
}) {
  const outline = props.style === "outline";
  const bare = props.style === "rows";
  // The lead is the whole first row: its tiles are the same size, so a
  // row-mate loading later would take over as LCP. The first one is fetched
  // first, the others eagerly.
  const leadIds = context.leadImage ? firstRow(props.items) : [];
  const leadOf = (id: string) => {
    const index = leadIds.indexOf(id);
    return index === 0 ? "high" : index > 0 ? "eager" : undefined;
  };
  return (
    <ul className="grid grid-cols-2 gap-3">
      {props.items.map((item) => {
        const network = props.icons ? networkForUrl(item.url) : null;
        const Icon = network?.icon;
        return (
          <li className={cn(item.featured && "col-span-2")} key={item.id}>
            <a
              className={cn(
                "group flex h-full flex-col overflow-hidden rounded-(--lp-radius) text-left transition-[filter,transform] hover:brightness-95 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--lp-primary)",
                bare
                  ? "gap-2"
                  : outline
                    ? "border border-(--lp-fg)/15"
                    : "bg-(--lp-muted)",
                item.featured &&
                  !bare &&
                  "bg-(--lp-primary) text-(--lp-primary-fg)",
              )}
              {...linkProps(item.url, id, item.id)}
            >
              {item.thumbnail ? (
                <Thumbnail
                  className={cn(
                    "w-full bg-(--lp-fg)/5 object-cover",
                    item.featured ? "aspect-[2/1]" : "aspect-[4/5]",
                    bare && "rounded-(--lp-radius)",
                  )}
                  item={item}
                  lead={leadOf(item.id)}
                />
              ) : Icon ? (
                <span className="flex aspect-[2/1] items-center justify-center bg-(--lp-fg)/5">
                  <Icon aria-hidden="true" className="size-7" />
                </span>
              ) : null}
              <span
                className={cn(
                  "flex flex-1 flex-col gap-0.5 text-sm leading-snug font-medium",
                  bare ? "px-0.5" : "p-3",
                )}
              >
                <span className="break-words">{item.label}</span>
                {item.description && (
                  <span
                    className={cn(
                      "text-[13px] font-normal",
                      item.featured && !bare ? "opacity-80" : mutedTextClass,
                    )}
                  >
                    {item.description}
                  </span>
                )}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Hairline-separated rows with a trailing arrow (an editorial list). */
function LinkRows({ id, props }: { id: string; props: LinksProps }) {
  return (
    <ul className="divide-y divide-(--lp-fg)/12 border-y border-(--lp-fg)/12">
      {props.items.map((item) => {
        const network = props.icons ? networkForUrl(item.url) : null;
        const Icon = network?.icon;
        return (
          <li key={item.id}>
            <a
              className="group flex min-h-14 items-center gap-3 py-3.5 text-left text-[15px] leading-snug font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--lp-primary)"
              {...linkProps(item.url, id, item.id)}
            >
              {item.thumbnail ? (
                <Thumbnail
                  className="size-11 shrink-0 rounded-[calc(var(--lp-radius)*0.6)] object-cover"
                  item={item}
                />
              ) : Icon ? (
                <Icon aria-hidden="true" className="size-5 shrink-0" />
              ) : null}
              <span
                className={cn(
                  "min-w-0 flex-1",
                  item.featured && "text-(--lp-primary)",
                )}
              >
                <ItemText item={item} />
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5"
              />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function LinksBlock({ id, props, context }: BlockRenderProps<LinksProps>) {
  if (props.items.length === 0) return null;
  const shape = buttonShapeClass(context.theme);
  const list =
    props.layout === "grid" ? (
      <LinkGrid context={context} id={id} props={props} />
    ) : props.style === "rows" ? (
      <LinkRows id={id} props={props} />
    ) : null;
  return (
    <nav aria-label={props.title || "Links"} className="space-y-3">
      {props.title && (
        <LpHeading
          as="h2"
          className="text-center text-sm font-semibold tracking-wide uppercase opacity-80"
          preview={context.thumbnail}
        >
          {props.title}
        </LpHeading>
      )}
      {list ?? (
        <ul className="space-y-3">
          {props.items.map((item) => {
            const network = props.icons ? networkForUrl(item.url) : null;
            const Icon = network?.icon;
            const leading = item.thumbnail ? (
              <img
                alt={item.thumbnail.alt}
                className={cn(
                  "size-10 shrink-0 rounded-[calc(var(--lp-radius)*0.6)] object-cover",
                  shape,
                )}
                decoding="async"
                height={40}
                loading="lazy"
                src={smallTemplatePhoto(item.thumbnail.url)}
                width={40}
              />
            ) : Icon ? (
              <Icon aria-hidden="true" className="size-5 shrink-0" />
            ) : null;
            const style =
              item.featured || props.style === "rows" ? "filled" : props.style;
            return (
              <li key={item.id}>
                <a
                  className={cn(
                    buttonClass(style, shape),
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
                  <ItemText item={item} />
                </a>
              </li>
            );
          })}
        </ul>
      )}
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
  leadImage: (props) =>
    props.layout === "grid" && props.items.some((item) => item.thumbnail),
});
