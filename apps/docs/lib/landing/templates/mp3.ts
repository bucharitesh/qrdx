import { Music } from "iconsax-reactjs";
import { themePreset } from "@/components/landing/theme";
import { registerTemplate } from "./registry";

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
      theme: { colors: themePreset("midnight"), font: "geist", radius: 14 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Night Drive",
            subtitle: "The new EP. Listen to every track here.",
          },
        },
        { type: "audio", props: { title: "" } },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "youtube", url: "https://youtube.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "podcast",
      name: "Podcast",
      description: "Latest episodes with show notes",
      theme: { colors: themePreset("sunset"), radius: 16 },
      blocks: [
        {
          type: "header",
          props: {
            title: "The Corner Shop Podcast",
            subtitle: "Weekly chats with local business owners.",
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
            body: "New episodes every Monday.",
          },
        },
      ],
    },
    {
      id: "voice-message",
      name: "Voice message",
      description: "One recording, for a card, gift or tour stop",
      theme: { colors: themePreset("forest"), font: "rounded", radius: 24 },
      blocks: [
        {
          type: "header",
          props: {
            title: "A message for you",
            subtitle: "Press play to listen.",
          },
        },
        { type: "audio", props: {} },
      ],
    },
  ],
});
