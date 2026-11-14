import { Profile2User } from "iconsax-reactjs";
import { templateMark, templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// Every social profile behind one code: a full-width row per network with
// its handle, so people follow the right account on the app they use.

registerTemplate({
  type: "social",
  label: "Social media",
  description: "All your social profiles on one page, with your handles",
  icon: Profile2User,
  order: 12,
  variants: [
    {
      id: "creator",
      name: "Creator",
      description: "Photo, a line about you and every profile",
      theme: {
        colors: {
          background: "#f6f2ec",
          foreground: "#1d1a16",
          primary: "#1d1a16",
          primaryForeground: "#f6f2ec",
          muted: "#ebe4d9",
          mutedForeground: "#5d564b",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 18,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            avatar: templatePhoto("portrait-designer", "Ines at her desk"),
            eyebrow: "Illustrator · London",
            title: "Ines Moreau",
            size: "xl",
            subtitle: "Drawing everyday places. Follow along wherever you are.",
          },
        },
        {
          type: "socials",
          props: {
            style: "list",
            items: [
              {
                network: "instagram",
                url: "https://instagram.com/",
                handle: "@ines.draws",
              },
              {
                network: "tiktok",
                url: "https://tiktok.com/",
                handle: "@ines.draws",
              },
              {
                network: "youtube",
                url: "https://youtube.com/",
                handle: "Ines Moreau Draws",
              },
              {
                network: "behance",
                url: "https://behance.net/",
                handle: "Portfolio",
              },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Shop prints",
            url: "https://example.com/prints",
            style: "outline",
          },
        },
      ],
    },
    {
      id: "brand",
      name: "Brand",
      description: "Your logo and channels, for packaging and counters",
      theme: {
        colors: {
          background: "#0f1720",
          foreground: "#eef3f7",
          primary: "#eef3f7",
          primaryForeground: "#0f1720",
          muted: "#18232f",
          mutedForeground: "#a2b0bd",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 14,
      },
      blocks: [
        {
          type: "header",
          props: {
            avatar: templateMark("logo-harbor", "Harbor & Co."),
            avatarShape: "rounded",
            title: "Harbor & Co.",
            size: "lg",
            subtitle:
              "Small-batch coffee roasters. Say hi on your favorite app.",
          },
        },
        {
          type: "socials",
          props: {
            style: "list",
            items: [
              {
                network: "instagram",
                url: "https://instagram.com/",
                handle: "@harborandco",
              },
              {
                network: "facebook",
                url: "https://facebook.com/",
                handle: "Harbor & Co.",
              },
              {
                network: "tiktok",
                url: "https://tiktok.com/",
                handle: "@harborandco",
              },
              {
                network: "linkedin",
                url: "https://linkedin.com/",
                handle: "Harbor & Co.",
              },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Visit our website",
            url: "https://example.com",
          },
        },
      ],
    },
    {
      id: "grid",
      name: "Grid",
      description: "Bold buttons in two columns, nothing else",
      theme: {
        colors: {
          background: "#ffffff",
          foreground: "#0a0a0a",
          primary: "#0a0a0a",
          primaryForeground: "#ffffff",
          muted: "#f2f2f2",
          mutedForeground: "#5d5d5d",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 12,
      },
      blocks: [
        {
          type: "header",
          props: {
            title: "@noahfilms",
            size: "xl",
            subtitle: "Short films and behind the scenes.",
          },
        },
        {
          type: "socials",
          props: {
            style: "buttons",
            items: [
              { network: "youtube", url: "https://youtube.com/" },
              { network: "instagram", url: "https://instagram.com/" },
              { network: "tiktok", url: "https://tiktok.com/" },
              { network: "x", url: "https://x.com/" },
              { network: "threads", url: "https://threads.net/" },
              { network: "bluesky", url: "https://bsky.app/" },
            ],
          },
        },
      ],
    },
  ],
});
