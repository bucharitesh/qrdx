import { Mobile as Smartphone } from "iconsax-reactjs";
import { templateMark, templatePhoto } from "./media";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "apps",
  label: "App download",
  description: "One code for the App Store, Google Play and the web",
  icon: Smartphone,
  order: 43,
  variants: [
    {
      id: "app-launch",
      name: "App launch",
      description: "Warm and friendly; the visitor's store comes first",
      theme: {
        colors: {
          background: "#fbf8f4",
          foreground: "#1e1611",
          primary: "#1e1611",
          primaryForeground: "#fbf8f4",
          muted: "#f1ebe3",
          mutedForeground: "#675a4e",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 20,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            cover: templatePhoto("banner-coffee-bar", "A pour-over coffee bar"),
            avatar: templateMark("app-brewly", "Brewly app icon"),
            avatarShape: "rounded",
            eyebrow: "Order ahead",
            title: "Skip the line",
            size: "lg",
            subtitle:
              "Order from 40 independent cafés and earn a free drink every nine orders.",
          },
        },
        {
          type: "apps",
          props: {
            icon: templateMark("app-brewly", "Brewly"),
            name: "Brewly",
            description: "Free on iPhone, iPad and Android.",
            appStoreUrl: "https://apps.apple.com/",
            playStoreUrl: "https://play.google.com/store/apps",
            webUrl: "https://example.com/app",
            webLabel: "Order in your browser",
          },
        },
        {
          type: "text",
          props: {
            heading: "Why people switch",
            body: "• Order in two taps, pick up without waiting\n• A stamp card that lives on your phone\n• App-only offers from your local cafés",
            card: true,
          },
        },
      ],
    },
    {
      id: "game",
      name: "Game",
      description: "Starry hero, store links, trailer and community",
      theme: {
        colors: {
          background: "#0b0820",
          foreground: "#f5f3ff",
          primary: "#b6a1fb",
          primaryForeground: "#0b0820",
          muted: "#17123a",
          mutedForeground: "#b4acd6",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 18,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto(
              "hero-night-sky",
              "A figure under the Milky Way",
            ),
            avatar: templateMark("app-pixel-quest", "Pixel Quest icon"),
            avatarShape: "rounded",
            eyebrow: "Puzzle adventure",
            title: "Pixel Quest",
            size: "xl",
            subtitle: "Relight the lost stars across 120 hand-built levels.",
          },
        },
        {
          type: "apps",
          props: {
            name: "Pixel Quest",
            description: "Free to play. No ads, ever.",
            appStoreUrl: "https://apps.apple.com/",
            playStoreUrl: "https://play.google.com/store/apps",
          },
        },
        {
          type: "video-embed",
          props: {
            url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
            title: "Launch trailer",
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "discord", url: "https://discord.com/" },
              { network: "youtube", url: "https://youtube.com/" },
              { network: "tiktok", url: "https://tiktok.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "wellness",
      name: "Wellness",
      description: "Calm photo header, soft colors, feature list",
      theme: {
        colors: {
          background: "#eef4f2",
          foreground: "#10231f",
          primary: "#164e45",
          primaryForeground: "#ffffff",
          muted: "#dfeae6",
          mutedForeground: "#48605a",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 24,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto(
              "hero-lake",
              "A canoe on a still mountain lake",
            ),
            avatar: templateMark("app-stillwater", "Stillwater icon"),
            avatarShape: "rounded",
            eyebrow: "Sleep · Breathe · Focus",
            title: "Ten quiet minutes a day",
            size: "lg",
            subtitle: "Guided sessions for busy minds. Start free for 14 days.",
          },
        },
        {
          type: "apps",
          props: {
            icon: templateMark("app-stillwater", "Stillwater"),
            name: "Stillwater",
            description: "4.8 stars from 12,000 ratings",
            appStoreUrl: "https://apps.apple.com/",
            playStoreUrl: "https://play.google.com/store/apps",
          },
        },
        {
          type: "links",
          props: {
            title: "Inside the app",
            style: "rows",
            icons: false,
            items: [
              {
                label: "Sleep stories",
                description: "Read by actors, new every week",
                url: "https://example.com/sleep",
              },
              {
                label: "Breathing exercises",
                description: "One to five minutes",
                url: "https://example.com/breathe",
              },
              {
                label: "Focus music",
                description: "No lyrics, no ads",
                url: "https://example.com/focus",
              },
            ],
          },
        },
      ],
    },
  ],
});
