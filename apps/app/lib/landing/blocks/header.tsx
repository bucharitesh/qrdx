import { cn } from "@repo/design-system/lib/utils";
import { Profile as UserRound } from "iconsax-reactjs";
import { z } from "zod";
import {
  alignSchema,
  imageSchema,
  lineText,
  longText,
  mutedTextClass,
} from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import {
  type BlockRenderContext,
  type BlockRenderProps,
  registerBlock,
} from "../registry";
import { HeaderEditor } from "./header-editor";

export const HEADER_LAYOUTS = ["stack", "hero", "banner", "split"] as const;

export const headerSchema = z.object({
  title: lineText(80).default(""),
  subtitle: longText(300).default(""),
  avatar: imageSchema.optional(),
  avatarShape: z.enum(["circle", "rounded", "square"]).default("circle"),
  cover: imageSchema.optional(),
  align: alignSchema,
  /**
   * stack: cover, photo and text in a column (the original header).
   * hero: full-width cover photo with the text over it.
   * banner: full-width cover that fades into the page, photo overlapping it.
   * split: photo beside the text.
   */
  layout: z.enum(HEADER_LAYOUTS).default("stack"),
  /** Small line above the title ("Est. 2014 · Brooklyn") */
  eyebrow: lineText(60).default(""),
  /** Title size */
  size: z.enum(["md", "lg", "xl"]).default("md"),
});

export type HeaderProps = z.output<typeof headerSchema>;

const SHAPES = {
  circle: "rounded-full",
  rounded: "rounded-(--lp-radius)",
  square: "rounded-none",
} as const;

const TITLE_SIZES = {
  md: "text-2xl leading-tight",
  lg: "text-[2rem] leading-[1.1]",
  xl: "text-[2.625rem] leading-[1.04]",
} as const;

/**
 * Full page width (the page has px-5) and flush with the top of the page
 * when the header is the first block (pt-10).
 */
const BLEED = "-mx-5 w-auto max-w-none";
const FLUSH_TOP = "[.lp-block:first-child>&]:-mt-10";
const FLUSH_TOP_NESTED = "[.lp-block:first-child>header>&]:-mt-10";

/** Lazy in thumbnails; otherwise left to the browser (the header is above the fold). */
const imageLoading = (context: BlockRenderContext) =>
  context.thumbnail ? ("lazy" as const) : undefined;

/** The cover is the page's lead photo (LandingRender): fetch it first. */
const coverPriority = (context: BlockRenderContext) =>
  context.leadImage ? ("high" as const) : undefined;

function HeaderText({
  props,
  context,
  tone = "page",
}: {
  props: HeaderProps;
  context: BlockRenderContext;
  /** "photo": light text on a darkened photo */
  tone?: "page" | "photo";
}) {
  if (!(props.title || props.subtitle || props.eyebrow)) return null;
  return (
    <div className="space-y-1.5">
      {props.eyebrow && (
        <p
          className={cn(
            "text-[11px] font-semibold tracking-[0.18em] uppercase",
            tone === "photo" ? "text-white/80" : mutedTextClass,
          )}
        >
          {props.eyebrow}
        </p>
      )}
      {props.title && (
        <LpHeading
          as="h1"
          className={cn(
            TITLE_SIZES[props.size],
            "font-bold tracking-tight text-balance",
          )}
          preview={context.thumbnail}
        >
          {props.title}
        </LpHeading>
      )}
      {props.subtitle && (
        <p
          className={cn(
            "text-[15px] leading-relaxed whitespace-pre-line",
            tone === "photo" ? "text-white/85" : mutedTextClass,
          )}
        >
          {props.subtitle}
        </p>
      )}
    </div>
  );
}

function Avatar({
  props,
  context,
  className,
}: {
  props: HeaderProps;
  context: BlockRenderContext;
  className: string;
}) {
  if (!props.avatar) return null;
  return (
    <img
      alt={props.avatar.alt}
      className={cn("object-cover", SHAPES[props.avatarShape], className)}
      decoding="async"
      loading={imageLoading(context)}
      src={props.avatar.url}
    />
  );
}

/** Cover photo filling the top of the page, title and bio over it. */
function HeroHeader({
  props,
  context,
}: {
  props: HeaderProps & { cover: NonNullable<HeaderProps["cover"]> };
  context: BlockRenderContext;
}) {
  const centered = props.align === "center";
  return (
    <header
      className={cn(
        BLEED,
        FLUSH_TOP,
        "relative isolate flex min-h-[26rem] flex-col justify-end overflow-hidden text-white",
      )}
    >
      <img
        alt={props.cover.alt}
        className="absolute inset-0 -z-10 size-full object-cover"
        decoding="async"
        fetchPriority={coverPriority(context)}
        loading={imageLoading(context)}
        src={props.cover.url}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/35 to-black/5"
      />
      <div
        className={cn(
          "flex flex-col gap-4 px-6 pt-28 pb-8",
          centered ? "items-center text-center" : "items-start text-left",
        )}
      >
        <Avatar
          className="size-16 shadow-sm ring-2 ring-white/70"
          context={context}
          props={props}
        />
        <HeaderText context={context} props={props} tone="photo" />
      </div>
    </header>
  );
}

/** Edge-to-edge cover that fades into the page, photo overlapping it. */
function BannerHeader({
  props,
  context,
}: {
  props: HeaderProps & { cover: NonNullable<HeaderProps["cover"]> };
  context: BlockRenderContext;
}) {
  const centered = props.align === "center";
  return (
    <header
      className={cn(
        "flex flex-col gap-3",
        centered ? "items-center text-center" : "items-start text-left",
      )}
    >
      <div className={cn(BLEED, FLUSH_TOP_NESTED, "relative self-stretch")}>
        <img
          alt={props.cover.alt}
          className="aspect-[16/11] w-full object-cover"
          decoding="async"
          fetchPriority={coverPriority(context)}
          loading={imageLoading(context)}
          src={props.cover.url}
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-b from-transparent to-(--lp-bg)"
        />
      </div>
      <Avatar
        className="relative -mt-16 size-24 shadow-sm ring-4 ring-(--lp-bg)"
        context={context}
        props={props}
      />
      <HeaderText context={context} props={props} />
    </header>
  );
}

/** Photo beside the text; an optional cover sits above them. */
function SplitHeader({
  props,
  context,
}: {
  props: HeaderProps;
  context: BlockRenderContext;
}) {
  return (
    <header className="flex flex-col gap-4">
      {props.cover && (
        <img
          alt={props.cover.alt}
          className="aspect-[3/1] w-full rounded-(--lp-radius) object-cover"
          decoding="async"
          fetchPriority={coverPriority(context)}
          loading={imageLoading(context)}
          src={props.cover.url}
        />
      )}
      <div className="flex items-center gap-4 text-left">
        <Avatar
          className="size-20 shrink-0 shadow-sm"
          context={context}
          props={props}
        />
        <div className="min-w-0 flex-1">
          <HeaderText context={context} props={props} />
        </div>
      </div>
    </header>
  );
}

function HeaderBlock({ props, context }: BlockRenderProps<HeaderProps>) {
  const { cover } = props;
  if (props.layout === "hero" && cover) {
    return <HeroHeader context={context} props={{ ...props, cover }} />;
  }
  if (props.layout === "banner" && cover) {
    return <BannerHeader context={context} props={{ ...props, cover }} />;
  }
  if (props.layout === "split") {
    return <SplitHeader context={context} props={props} />;
  }

  // "stack": the original header. Pages that don't set the new options
  // (eyebrow, size) render exactly as before.
  const centered = props.align === "center";
  return (
    <header
      className={cn(
        "flex flex-col gap-3",
        centered ? "items-center text-center" : "items-start text-left",
      )}
    >
      {props.cover && (
        <img
          alt={props.cover.alt}
          className="aspect-[3/1] w-full rounded-(--lp-radius) object-cover"
          decoding="async"
          fetchPriority={coverPriority(context)}
          loading={imageLoading(context)}
          src={props.cover.url}
        />
      )}
      {props.avatar && (
        <img
          alt={props.avatar.alt}
          className={cn(
            "size-24 object-cover shadow-sm ring-4 ring-(--lp-bg)",
            SHAPES[props.avatarShape],
            props.cover && "-mt-14",
          )}
          decoding="async"
          height={96}
          loading={imageLoading(context)}
          src={props.avatar.url}
          width={96}
        />
      )}
      <HeaderText context={context} props={props} />
    </header>
  );
}

export const headerBlock = registerBlock({
  type: "header",
  category: "content",
  label: "Profile header",
  description: "Photo or logo, name and a short bio",
  icon: UserRound,
  schema: headerSchema,
  defaults: { title: "Your name", subtitle: "A line about who you are" },
  Render: HeaderBlock,
  Editor: HeaderEditor,
  leadImage: (props) => Boolean(props.cover),
});
