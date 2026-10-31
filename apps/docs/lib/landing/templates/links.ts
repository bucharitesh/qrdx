import { Link2 } from "lucide-react";
import { themePreset } from "@/components/landing/theme";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "links",
  label: "Link list",
  description: "All your links, socials and latest work on one page",
  icon: Link2,
  order: 10,
  variants: [
    {
      id: "creator",
      name: "Creator",
      description: "Bio, featured links and socials",
      theme: { colors: themePreset("berry"), font: "rounded", radius: 16 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Maya Lin",
            subtitle: "Designer & creator. New video every Tuesday.",
          },
        },
        {
          type: "links",
          props: {
            items: [
              {
                label: "Watch my latest video",
                url: "https://youtube.com/",
                featured: true,
              },
              { label: "Shop my presets", url: "https://example.com/shop" },
              {
                label: "Join the newsletter",
                url: "https://example.com/newsletter",
              },
              {
                label: "Work with me",
                url: "mailto:hello@example.com",
              },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "tiktok", url: "https://tiktok.com/" },
              { network: "youtube", url: "https://youtube.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "musician",
      name: "Musician",
      description: "New release, streaming links and tour dates",
      theme: { colors: themePreset("midnight"), font: "geist", radius: 8 },
      blocks: [
        {
          type: "header",
          props: {
            title: "The Night Owls",
            subtitle: "New single “Afterglow” out now",
          },
        },
        {
          type: "video-embed",
          props: {
            url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
            title: "Afterglow (official video)",
          },
        },
        {
          type: "links",
          props: {
            style: "outline",
            items: [
              { label: "Listen on Spotify", url: "https://open.spotify.com/" },
              { label: "Apple Music", url: "https://music.apple.com/" },
              { label: "Tour dates", url: "https://example.com/tour" },
              { label: "Merch store", url: "https://example.com/merch" },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "spotify", url: "https://open.spotify.com/" },
              { network: "youtube", url: "https://youtube.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "minimal",
      name: "Minimal",
      description: "Just a name and a few links",
      theme: { colors: themePreset("classic"), radius: 32 },
      blocks: [
        { type: "header", props: { title: "Sam Rivera", subtitle: "" } },
        {
          type: "links",
          props: {
            style: "outline",
            icons: false,
            items: [
              { label: "Portfolio", url: "https://example.com" },
              { label: "Blog", url: "https://example.com/blog" },
              { label: "Contact", url: "mailto:sam@example.com" },
            ],
          },
        },
      ],
    },
    {
      id: "podcast",
      name: "Podcast",
      description: "Show intro and where to listen",
      theme: { colors: themePreset("sunset"), font: "serif", radius: 12 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Small Talk, Big Ideas",
            subtitle: "A weekly podcast about building things that last.",
          },
        },
        {
          type: "links",
          props: {
            items: [
              {
                label: "Apple Podcasts",
                url: "https://podcasts.apple.com/",
              },
              { label: "Spotify", url: "https://open.spotify.com/" },
              { label: "YouTube", url: "https://youtube.com/" },
              {
                label: "Be a guest",
                url: "https://example.com/guest",
                description: "Tell us your story",
              },
            ],
          },
        },
        {
          type: "text",
          props: {
            heading: "Latest episode",
            body: "Episode 42: Why the best tools feel invisible.",
            card: true,
          },
        },
      ],
    },
  ],
});
