import { cn } from "@repo/design-system/lib/utils";
import { AtSign } from "lucide-react";
import { z } from "zod";
import {
  itemIdSchema,
  linkProps,
  linkUrlSchema,
} from "@/components/landing/block-kit";
import {
  getSocialNetwork,
  SOCIAL_NETWORK_IDS,
} from "@/components/landing/social-networks";
import { type BlockRenderProps, registerBlock } from "../registry";
import { SocialsEditor } from "./socials-editor";

export const socialItemSchema = z.object({
  id: itemIdSchema,
  network: z.enum(SOCIAL_NETWORK_IDS),
  url: linkUrlSchema,
});

export const socialsSchema = z.object({
  items: z.array(socialItemSchema).max(30).default([]),
  style: z.enum(["icons", "buttons"]).default("icons"),
});

export type SocialsProps = z.output<typeof socialsSchema>;
export type SocialItem = SocialsProps["items"][number];

function SocialsBlock({ id, props }: BlockRenderProps<SocialsProps>) {
  if (props.items.length === 0) return null;
  const buttons = props.style === "buttons";
  return (
    <ul
      aria-label="Social profiles"
      className={cn(
        buttons
          ? "grid grid-cols-2 gap-2"
          : "flex flex-wrap justify-center gap-2",
      )}
    >
      {props.items.map((item) => {
        const network = getSocialNetwork(item.network);
        const Icon = network.icon;
        return (
          <li key={item.id}>
            <a
              className={cn(
                "flex items-center justify-center gap-2 transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--lp-primary)",
                buttons
                  ? "min-h-11 rounded-(--lp-radius) bg-(--lp-muted) px-3 text-sm font-medium"
                  : "size-11 rounded-full bg-(--lp-muted)",
              )}
              title={network.label}
              {...linkProps(item.url, id, item.id)}
            >
              <Icon aria-hidden="true" className="size-5" />
              <span className={buttons ? "truncate" : "sr-only"}>
                {network.label}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export const socialsBlock = registerBlock({
  type: "socials",
  category: "links",
  label: "Social icons",
  description: "Instagram, TikTok, LinkedIn and more as icons",
  icon: AtSign,
  schema: socialsSchema,
  defaults: {
    items: [
      { id: "social1", network: "instagram", url: "https://instagram.com/" },
    ],
  },
  Render: SocialsBlock,
  Editor: SocialsEditor,
});
