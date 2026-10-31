import {
  GithubLogo as Github,
  LinkedinLogo as Linkedin,
  XLogo,
} from "@repo/design-system/components/icons";
import {
  Be,
  Cloud,
  Dribbble,
  Facebook,
  Global as Globe,
  Hashtag,
  Instagram,
  Sms as Mail,
  Messages2 as MessagesSquare,
  Music,
  Musicnote as Music2,
  Call as Phone,
  Bookmark as Pin,
  Microphone2 as Podcast,
  Brodcast as Rss,
  Send2 as Send,
  Snapchat,
  Spotify,
  Twitch,
  Whatsapp,
  Youtube,
} from "iconsax-reactjs";
import type { ComponentType } from "react";

type Icon = ComponentType<{ className?: string }>;

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
    icon: Instagram,
    hosts: ["instagram.com"],
    placeholder: "https://instagram.com/yourname",
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: Music2,
    hosts: ["tiktok.com"],
    placeholder: "https://tiktok.com/@yourname",
  },
  {
    id: "x",
    label: "X",
    icon: XLogo,
    hosts: ["x.com", "twitter.com"],
    placeholder: "https://x.com/yourname",
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    hosts: ["facebook.com", "fb.com"],
    placeholder: "https://facebook.com/yourpage",
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: Youtube,
    hosts: ["youtube.com", "youtu.be"],
    placeholder: "https://youtube.com/@yourchannel",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    hosts: ["linkedin.com"],
    placeholder: "https://linkedin.com/in/yourname",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: Whatsapp,
    hosts: ["wa.me", "whatsapp.com"],
    placeholder: "https://wa.me/15550100",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: Send,
    hosts: ["t.me", "telegram.me"],
    placeholder: "https://t.me/yourname",
  },
  {
    id: "threads",
    label: "Threads",
    icon: Hashtag,
    hosts: ["threads.net", "threads.com"],
    placeholder: "https://threads.net/@yourname",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    icon: Cloud,
    hosts: ["bsky.app"],
    placeholder: "https://bsky.app/profile/you.bsky.social",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    icon: Pin,
    hosts: ["pinterest.com", "pin.it"],
    placeholder: "https://pinterest.com/yourname",
  },
  {
    id: "snapchat",
    label: "Snapchat",
    icon: Snapchat,
    hosts: ["snapchat.com"],
    placeholder: "https://snapchat.com/add/yourname",
  },
  {
    id: "discord",
    label: "Discord",
    icon: MessagesSquare,
    hosts: ["discord.gg", "discord.com"],
    placeholder: "https://discord.gg/invite",
  },
  {
    id: "twitch",
    label: "Twitch",
    icon: Twitch,
    hosts: ["twitch.tv"],
    placeholder: "https://twitch.tv/yourname",
  },
  {
    id: "spotify",
    label: "Spotify",
    icon: Spotify,
    hosts: ["spotify.com"],
    placeholder: "https://open.spotify.com/artist/...",
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    icon: Music,
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
    icon: Github,
    hosts: ["github.com"],
    placeholder: "https://github.com/yourname",
  },
  {
    id: "dribbble",
    label: "Dribbble",
    icon: Dribbble,
    hosts: ["dribbble.com"],
    placeholder: "https://dribbble.com/yourname",
  },
  {
    id: "behance",
    label: "Behance",
    icon: Be,
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
