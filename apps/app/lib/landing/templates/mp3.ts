import { Music } from "iconsax-reactjs";
import { registerTemplate } from "./registry";

// Tracks and cover art are the owner's own files; the public demos use sample
// clips and artwork (lib/landing/demo.ts).

registerTemplate({
  type: "mp3",
  label: "MP3 / Audio",
  description: "Music, a podcast or a voice message with a player",
  icon: Music,
  order: 52,
  variants: [
    {
      id: "album",
      name: "Album",
      description: "Cover art, a playlist and your profiles",
      theme: {
        colors: {
          background: "#0c0d12",
          foreground: "#f3f4f6",
          primary: "#f3f4f6",
          primaryForeground: "#0c0d12",
          muted: "#171922",
          mutedForeground: "#9ca3af",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 14,
        background: {
          type: "gradient",
          from: "#2a2440",
          to: "#0c0d12",
          angle: 180,
          shape: "radial",
        },
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "New EP",
            title: "Night Drive",
            size: "xl",
            subtitle: "Mara Vale · 3 tracks · 11 min",
          },
        },
        { type: "audio", props: { title: "" } },
        {
          type: "links",
          props: {
            style: "outline",
            items: [
              { label: "Spotify", url: "https://open.spotify.com/" },
              { label: "Apple Music", url: "https://music.apple.com/" },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "youtube", url: "https://youtube.com/" },
              { network: "soundcloud", url: "https://soundcloud.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "podcast",
      name: "Podcast",
      description: "Latest episodes with show notes",
      theme: {
        colors: {
          background: "#f6efe6",
          foreground: "#22180f",
          primary: "#b43d0b",
          primaryForeground: "#ffffff",
          muted: "#ecdfd0",
          mutedForeground: "#665242",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 16,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "A weekly podcast",
            title: "The Corner Shop",
            size: "xl",
            subtitle:
              "Conversations with the people behind your favourite local shops.",
          },
        },
        {
          type: "audio",
          props: { title: "Latest episodes", allowDownload: true },
        },
        {
          type: "text",
          props: {
            heading: "About the show",
            body: "Hosted by Dana Brooks. New episodes every Monday, about 30 minutes each.",
          },
        },
        {
          type: "links",
          props: {
            style: "rows",
            items: [
              { label: "Apple Podcasts", url: "https://podcasts.apple.com/" },
              { label: "Spotify", url: "https://open.spotify.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "voice-message",
      name: "Voice message",
      description: "One recording for a card, a gift or a tour stop",
      theme: {
        colors: {
          background: "#eef2ec",
          foreground: "#1b241d",
          primary: "#2f4a36",
          primaryForeground: "#ffffff",
          muted: "#dfe7dc",
          mutedForeground: "#526056",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 24,
        spacing: "relaxed",
        texture: "grain",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "A message for you",
            title: "Happy birthday, Lily",
            size: "xl",
            subtitle: "Turn the sound up and press play.",
          },
        },
        { type: "audio", props: {} },
      ],
    },
  ],
});
