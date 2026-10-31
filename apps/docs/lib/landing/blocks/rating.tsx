import { cn } from "@repo/design-system/lib/utils";
import { Star } from "lucide-react";
import { z } from "zod";
import {
  buttonClass,
  itemIdSchema,
  lineText,
  linkProps,
  longText,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { landingUrlSchema } from "@/types/landing";
import { type BlockRenderProps, registerBlock } from "../registry";
import { ReviewLinksEditor } from "./rating-editor";

// "Leave us a review" buttons. Shown to every visitor, whatever they rated in
// a form: review sites (Google included) forbid asking only happy customers.

export const REVIEW_PLATFORMS = [
  "google",
  "tripadvisor",
  "yelp",
  "facebook",
  "trustpilot",
  "other",
] as const;

export type ReviewPlatform = (typeof REVIEW_PLATFORMS)[number];

export const REVIEW_PLATFORM_NAMES: Record<ReviewPlatform, string> = {
  google: "Google",
  tripadvisor: "Tripadvisor",
  yelp: "Yelp",
  facebook: "Facebook",
  trustpilot: "Trustpilot",
  other: "Other",
};

export const reviewLinksSchema = z.object({
  title: lineText(100).default("Enjoyed your visit?"),
  description: longText(300).default("A quick review helps others find us."),
  links: z
    .array(
      z.object({
        id: itemIdSchema,
        platform: z.enum(REVIEW_PLATFORMS).default("google"),
        /** Empty until the owner pastes their review link (then hidden) */
        url: landingUrlSchema.or(z.literal("")).default(""),
        /** Button text; defaults to "Review us on <platform>" */
        label: lineText(60).default(""),
      }),
    )
    .max(6)
    .default([]),
});

export type ReviewLinksProps = z.output<typeof reviewLinksSchema>;

export const reviewLabel = (link: ReviewLinksProps["links"][number]) =>
  link.label ||
  (link.platform === "other"
    ? "Leave a review"
    : `Review us on ${REVIEW_PLATFORM_NAMES[link.platform]}`);

export function ReviewLinksBlock({
  id,
  props,
  context,
}: BlockRenderProps<ReviewLinksProps>) {
  const links = props.links.filter((link) => link.url);
  if (links.length === 0) {
    // Hidden on the live page until a review link is added.
    return context.mode === "preview" ? (
      <p
        className={cn(
          mutedTextClass,
          "rounded-(--lp-radius) border border-dashed border-current/30 p-4 text-center text-sm",
        )}
      >
        Add your Google review link to show this block.
      </p>
    ) : null;
  }
  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={props.title ? titleId : undefined}
      aria-label={props.title ? undefined : "Reviews"}
      className={cn(surfaceClass, "space-y-4 p-5 text-center")}
    >
      <div aria-hidden="true" className="flex justify-center gap-1">
        {[0, 1, 2, 3, 4].map((index) => (
          <Star
            className="size-5 fill-(--lp-primary) text-(--lp-primary)"
            key={index}
          />
        ))}
      </div>
      {(props.title || props.description) && (
        <div className="space-y-1">
          {props.title && (
            <h2 className="text-lg leading-tight font-semibold" id={titleId}>
              {props.title}
            </h2>
          )}
          {props.description && (
            <p className={cn(mutedTextClass, "text-sm whitespace-pre-line")}>
              {props.description}
            </p>
          )}
        </div>
      )}
      <div className="space-y-2">
        {links.map((link, index) => (
          <a
            className={buttonClass(index === 0 ? "filled" : "outline")}
            key={link.id}
            {...linkProps(link.url, id, link.platform)}
          >
            {reviewLabel(link)}
          </a>
        ))}
      </div>
    </section>
  );
}

registerBlock({
  type: "review-links",
  category: "forms",
  label: "Review links",
  description: "Google and other review buttons, shown to every visitor",
  icon: Star,
  schema: reviewLinksSchema,
  defaults: { links: [{ platform: "google", url: "" }] },
  Render: ReviewLinksBlock,
  Editor: ReviewLinksEditor,
});
