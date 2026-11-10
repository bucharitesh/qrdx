import { MusicPlaylist } from "iconsax-reactjs";
import { registerTemplate } from "./registry";

// Several recordings that play one after another: a mix, the stops of an
// audio tour or a book's chapters. The tracks are the owner's own files;
// the public demos use sample clips (lib/landing/demo.ts).

registerTemplate({
  type: "playlist",
  label: "Playlist",
  description: "Tracks that play in a row: a mix, an audio tour or chapters",
  icon: MusicPlaylist,
  order: 54,
  variants: [
    {
      id: "mixtape",
      name: "Mixtape",
      description: "Cover art, the tracklist and where else to listen",
      theme: {
        colors: {
          background: "#0d0b10",
          foreground: "#f3f0f7",
          primary: "#f3f0f7",
          primaryForeground: "#0d0b10",
          muted: "#1a1720",
          mutedForeground: "#a59fb0",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 14,
        background: {
          type: "gradient",
          from: "#33224a",
          to: "#0d0b10",
          angle: 180,
          shape: "radial",
        },
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "A mix for the drive home",
            title: "Late Summer Tapes",
            size: "xl",
            subtitle: "Mixed by DJ Ola · press play and keep the windows down",
          },
        },
        { type: "audio", props: { title: "" } },
        {
          type: "links",
          props: {
            title: "Also on",
            style: "outline",
            items: [
              { label: "SoundCloud", url: "https://soundcloud.com/" },
              { label: "Mixcloud", url: "https://mixcloud.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "audio-tour",
      name: "Audio tour",
      description: "Numbered stops for a museum, a walk or a building",
      theme: {
        colors: {
          background: "#f4f1ea",
          foreground: "#1e1b16",
          primary: "#1e1b16",
          primaryForeground: "#f4f1ea",
          muted: "#e9e3d7",
          mutedForeground: "#5f584c",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 10,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Self-guided tour · 6 stops · 30 min",
            title: "The Old Harbor Walk",
            size: "xl",
            subtitle:
              "Start at the lighthouse and follow the numbered posts along the quay.",
          },
        },
        {
          type: "audio",
          props: { title: "Stops", allowDownload: true },
        },
        {
          type: "text",
          props: {
            heading: "Before you start",
            body: "Bring headphones if you can. Each stop plays on its own, so you can pause and walk on at your own pace.",
            card: true,
          },
        },
      ],
    },
    {
      id: "audiobook",
      name: "Audiobook",
      description: "Chapters to listen to in order or download",
      theme: {
        colors: {
          background: "#fbf8f3",
          foreground: "#221d17",
          primary: "#5b3a1a",
          primaryForeground: "#ffffff",
          muted: "#f1ebe1",
          mutedForeground: "#645a4d",
        },
        font: "serif",
        headingFont: "cormorant",
        radius: 6,
        spacing: "relaxed",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Read by the author",
            title: "The Lighthouse Keeper",
            size: "xl",
            subtitle: "A short novel in six chapters",
          },
        },
        {
          type: "audio",
          props: { title: "Chapters", allowDownload: true },
        },
        {
          type: "text",
          props: {
            heading: "About the book",
            body: "One winter, one island and the keeper who refused to leave it. Thank you for buying the paperback: this recording comes with it.",
          },
        },
      ],
    },
  ],
});
