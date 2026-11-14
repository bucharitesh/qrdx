import { Video } from "iconsax-reactjs";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "video",
  label: "Video",
  description: "A YouTube, Vimeo or Loom video, or a video file you upload",
  icon: Video,
  order: 53,
  variants: [
    {
      id: "product-video",
      name: "Product video",
      description: "A YouTube or Vimeo video with specs and a buy button",
      theme: {
        colors: {
          background: "#f5f5f4",
          foreground: "#111111",
          primary: "#111111",
          primaryForeground: "#ffffff",
          muted: "#e9e9e6",
          mutedForeground: "#58584f",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 16,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Aero 2 headphones",
            title: "See it in action",
            size: "xl",
            subtitle: "Two minutes on everything in the box.",
          },
        },
        { type: "video-embed", props: {} },
        {
          type: "links",
          props: {
            style: "rows",
            icons: false,
            items: [
              {
                label: "40-hour battery",
                description: "Five minutes of charge for three hours of play",
                url: "https://example.com/aero-2#battery",
              },
              {
                label: "Adaptive noise cancelling",
                url: "https://example.com/aero-2#anc",
              },
              {
                label: "Full specs",
                url: "https://example.com/aero-2/specs",
              },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Buy now · $249",
            url: "https://example.com/shop",
            note: "Free delivery and 30-day returns",
          },
        },
      ],
    },
    {
      id: "uploaded-video",
      name: "Uploaded video",
      description: "Play your own MP4, no YouTube needed",
      theme: {
        colors: {
          background: "#0f0f10",
          foreground: "#f4f4f5",
          primary: "#f4f4f5",
          primaryForeground: "#0f0f10",
          muted: "#1b1b1d",
          mutedForeground: "#a1a1aa",
        },
        font: "dm-sans",
        headingFont: "dm-sans",
        radius: 12,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "A short video from the team",
            title: "Welcome aboard",
            size: "lg",
            subtitle:
              "Everything you need for your first week, in three minutes.",
          },
        },
        { type: "video-file", props: {} },
        {
          type: "links",
          props: {
            style: "rows",
            icons: false,
            items: [
              {
                label: "Your first-week checklist",
                url: "https://example.com/checklist",
              },
              {
                label: "Questions? Ask the team",
                url: "mailto:team@example.com",
              },
            ],
          },
        },
      ],
    },
    {
      id: "looping-clip",
      name: "Looping clip",
      description: "A short silent clip that plays on its own, like a GIF",
      theme: {
        colors: {
          background: "#fdf6ee",
          foreground: "#2a1d12",
          primary: "#2a1d12",
          primaryForeground: "#fdf6ee",
          muted: "#f3e8da",
          mutedForeground: "#6a5845",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 20,
        buttonShape: "pill",
      },
      blocks: [
        { type: "video-file", props: { autoplay: true, aspect: "portrait" } },
        {
          type: "header",
          props: {
            eyebrow: "New season",
            title: "The spring edit",
            size: "lg",
            subtitle: "In stores and online now.",
          },
        },
        {
          type: "button",
          props: { label: "Find a store", url: "https://example.com/stores" },
        },
      ],
    },
  ],
});
