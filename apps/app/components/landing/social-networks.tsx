import { LinkedinLogo } from "@repo/design-system/components/icons";
import {
  Global as Globe,
  Sms as Mail,
  Call as Phone,
  Microphone2 as Podcast,
  Brodcast as Rss,
} from "iconsax-reactjs";
import type { ComponentType } from "react";
import { brandIcon } from "@/lib/brand-logos/brand-logo";

type Icon = ComponentType<{ className?: string }>;

// Brands get their real marks (Simple Icons) in the text color, inset like
// the iconsax glyphs the generic entries use. LinkedIn asked Simple Icons
// to remove its mark, so it keeps the design system's, inset the same way
// (also used by the QR type pickers and cards).
export function LinkedinIcon({ className }: { className?: string }) {
  return (
    <LinkedinLogo aria-hidden className={className} viewBox="-2 -2 28 28" />
  );
}

export interface SocialNetwork {
  id: string;
  label: string;
  icon: Icon;
  /** Hosts (and their subdomains) that belong to the network */
  hosts: string[];
  placeholder: string;
}

export const SOCIAL_NETWORKS: SocialNetwork[] = [
  {
    id: "instagram",
    label: "Instagram",
    icon: brandIcon("instagram"),
    hosts: ["instagram.com"],
    placeholder: "https://instagram.com/yourname",
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: brandIcon("tiktok"),
    hosts: ["tiktok.com"],
    placeholder: "https://tiktok.com/@yourname",
  },
  {
    id: "x",
    label: "X",
    icon: brandIcon("x"),
    hosts: ["x.com", "twitter.com"],
    placeholder: "https://x.com/yourname",
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: brandIcon("facebook"),
    hosts: ["facebook.com", "fb.com"],
    placeholder: "https://facebook.com/yourpage",
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: brandIcon("youtube"),
    hosts: ["youtube.com", "youtu.be"],
    placeholder: "https://youtube.com/@yourchannel",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: LinkedinIcon,
    hosts: ["linkedin.com"],
    placeholder: "https://linkedin.com/in/yourname",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: brandIcon("whatsapp"),
    hosts: ["wa.me", "whatsapp.com"],
    placeholder: "https://wa.me/15550100",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: brandIcon("telegram"),
    hosts: ["t.me", "telegram.me"],
    placeholder: "https://t.me/yourname",
  },
  {
    id: "threads",
    label: "Threads",
    icon: brandIcon("threads"),
    hosts: ["threads.net", "threads.com"],
    placeholder: "https://threads.net/@yourname",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    icon: brandIcon("bluesky"),
    hosts: ["bsky.app"],
    placeholder: "https://bsky.app/profile/you.bsky.social",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    icon: brandIcon("pinterest"),
    hosts: ["pinterest.com", "pin.it"],
    placeholder: "https://pinterest.com/yourname",
  },
  {
    id: "snapchat",
    label: "Snapchat",
    icon: brandIcon("snapchat"),
    hosts: ["snapchat.com"],
    placeholder: "https://snapchat.com/add/yourname",
  },
  {
    id: "discord",
    label: "Discord",
    icon: brandIcon("discord"),
    hosts: ["discord.gg", "discord.com"],
    placeholder: "https://discord.gg/invite",
  },
  {
    id: "twitch",
    label: "Twitch",
    icon: brandIcon("twitch"),
    hosts: ["twitch.tv"],
    placeholder: "https://twitch.tv/yourname",
  },
  {
    id: "spotify",
    label: "Spotify",
    icon: brandIcon("spotify"),
    hosts: ["spotify.com"],
    placeholder: "https://open.spotify.com/artist/...",
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    icon: brandIcon("soundcloud"),
    hosts: ["soundcloud.com"],
    placeholder: "https://soundcloud.com/yourname",
  },
  {
    id: "podcast",
    label: "Podcast",
    icon: Podcast,
    hosts: ["podcasts.apple.com"],
    placeholder: "https://podcasts.apple.com/...",
  },
  {
    id: "github",
    label: "GitHub",
    icon: brandIcon("github"),
    hosts: ["github.com"],
    placeholder: "https://github.com/yourname",
  },
  {
    id: "dribbble",
    label: "Dribbble",
    icon: brandIcon("dribbble"),
    hosts: ["dribbble.com"],
    placeholder: "https://dribbble.com/yourname",
  },
  {
    id: "behance",
    label: "Behance",
    icon: brandIcon("behance"),
    hosts: ["behance.net"],
    placeholder: "https://behance.net/yourname",
  },
  {
    id: "blog",
    label: "Blog",
    icon: Rss,
    hosts: [],
    placeholder: "https://yourblog.com",
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
    hosts: [],
    placeholder: "mailto:you@example.com",
  },
  {
    id: "phone",
    label: "Phone",
    icon: Phone,
    hosts: [],
    placeholder: "tel:+15550100",
  },
  {
    id: "website",
    label: "Website",
    icon: Globe,
    hosts: [],
    placeholder: "https://example.com",
  },
];

export const SOCIAL_NETWORK_IDS = SOCIAL_NETWORKS.map(
  (network) => network.id,
) as [string, ...string[]];

export function getSocialNetwork(id: string): SocialNetwork {
  return (
    SOCIAL_NETWORKS.find((network) => network.id === id) ??
    (SOCIAL_NETWORKS.at(-1) as SocialNetwork)
  );
}

/** The network a link points to, from its host (mailto:/tel: included). */
export function networkForUrl(href: string): SocialNetwork | null {
  try {
    const url = new URL(href);
    if (url.protocol === "mailto:") return getSocialNetwork("email");
    if (url.protocol === "tel:") return getSocialNetwork("phone");
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (
      SOCIAL_NETWORKS.find((network) =>
        network.hosts.some(
          (candidate) => host === candidate || host.endsWith(`.${candidate}`),
        ),
      ) ?? null
    );
  } catch {
    return null;
  }
}
