import { Link2 } from "iconsax-reactjs";
import { templateMark, templatePhoto } from "./media";
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
      description: "Warm and editorial, with a shop of presets",
      theme: {
        colors: {
          background: "#f4efe7",
          foreground: "#1d1b18",
          primary: "#1d1b18",
          primaryForeground: "#f4efe7",
          muted: "#e9e2d6",
          mutedForeground: "#5e574d",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 18,
        buttonShape: "pill",
        texture: "grain",
      },
      blocks: [
        {
          type: "header",
          props: {
            avatar: templatePhoto(
              "portrait-photographer",
              "Maya with her film camera",
            ),
            eyebrow: "Photographer · Lisbon",
            title: "Maya Lin",
            size: "xl",
            subtitle:
              "Film photographs and slow travel. A new video every Tuesday.",
          },
        },
        {
          type: "links",
          props: {
            items: [
              {
                label: "New video: 48 hours in Norway",
                url: "https://youtube.com/",
                featured: true,
              },
              {
                label: "Book a portrait session",
                url: "https://example.com/book",
              },
              {
                label: "Field Notes, my monthly letter",
                description: "12,400 readers",
                url: "https://example.com/newsletter",
              },
              { label: "Work with me", url: "mailto:hello@example.com" },
            ],
          },
        },
        {
          type: "links",
          props: {
            title: "Lightroom presets",
            layout: "grid",
            style: "rows",
            items: [
              {
                label: "Alpine",
                description: "12 presets · $24",
                url: "https://example.com/presets/alpine",
                thumbnail: templatePhoto("tile-alpine", "Snowy peaks"),
              },
              {
                label: "Valley",
                description: "12 presets · $24",
                url: "https://example.com/presets/valley",
                thumbnail: templatePhoto("tile-valley", "Granite valley"),
              },
              {
                label: "Coast",
                description: "10 presets · $19",
                url: "https://example.com/presets/coast",
                thumbnail: templatePhoto("tile-lighthouse", "A lighthouse"),
              },
              {
                label: "Dusk",
                description: "10 presets · $19",
                url: "https://example.com/presets/dusk",
                thumbnail: templatePhoto("tile-city-dusk", "A city at dusk"),
              },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "youtube", url: "https://youtube.com/" },
              { network: "tiktok", url: "https://tiktok.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "musician",
      name: "Musician",
      description: "Stage photo, streaming links and tour dates",
      theme: {
        colors: {
          background: "#0b0b0c",
          foreground: "#f5f5f4",
          primary: "#f5f5f4",
          primaryForeground: "#0b0b0c",
          muted: "#19191b",
          mutedForeground: "#a3a3a8",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 4,
        buttonShape: "sharp",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            align: "left",
            cover: templatePhoto("hero-band", "The band playing live"),
            eyebrow: "New single out now",
            title: "The Night Owls",
            size: "xl",
            subtitle: "“Afterglow”, streaming everywhere.",
          },
        },
        {
          type: "links",
          props: {
            style: "outline",
            items: [
              {
                label: "Listen on Spotify",
                url: "https://open.spotify.com/",
                featured: true,
              },
              { label: "Apple Music", url: "https://music.apple.com/" },
              { label: "Bandcamp", url: "https://bandcamp.com/" },
            ],
          },
        },
        {
          type: "links",
          props: {
            title: "On tour",
            style: "rows",
            icons: false,
            items: [
              {
                label: "Brooklyn, NY",
                description: "Fri 14 Nov · Elsewhere",
                url: "https://example.com/tickets/brooklyn",
              },
              {
                label: "Philadelphia, PA",
                description: "Sat 15 Nov · Union Transfer",
                url: "https://example.com/tickets/philadelphia",
              },
              {
                label: "Boston, MA",
                description: "Sun 16 Nov · Sold out, join the waitlist",
                url: "https://example.com/tickets/boston",
              },
              {
                label: "Montréal, QC",
                description: "Wed 19 Nov · Le Studio",
                url: "https://example.com/tickets/montreal",
              },
            ],
          },
        },
        {
          type: "video-embed",
          props: {
            url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
            title: "Afterglow (live session)",
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
      description: "Typographic, black on white, links as rows",
      theme: {
        colors: {
          background: "#ffffff",
          foreground: "#0a0a0a",
          primary: "#0a0a0a",
          primaryForeground: "#ffffff",
          muted: "#f4f4f4",
          mutedForeground: "#5f5f5f",
        },
        font: "geist",
        headingFont: "instrument-serif",
        radius: 0,
        spacing: "relaxed",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Independent designer",
            title: "Sam Rivera",
            size: "xl",
            subtitle:
              "Brand identities and type for small companies. Based in Lisbon, working everywhere.",
          },
        },
        {
          type: "links",
          props: {
            style: "rows",
            icons: false,
            items: [
              { label: "Selected work", url: "https://example.com/work" },
              { label: "Journal", url: "https://example.com/journal" },
              {
                label: "Book an intro call",
                description: "20 minutes, free",
                url: "https://example.com/call",
              },
              { label: "sam@example.com", url: "mailto:sam@example.com" },
            ],
          },
        },
        {
          type: "text",
          props: {
            heading: "",
            body: "Currently booking projects from March.",
            size: "sm",
          },
        },
      ],
    },
    {
      id: "podcast",
      name: "Podcast",
      description: "Cover art, where to listen and the latest episode",
      theme: {
        colors: {
          background: "#1c1714",
          foreground: "#f6eee3",
          primary: "#f0b37e",
          primaryForeground: "#1c1714",
          muted: "#2b241f",
          mutedForeground: "#b9ab9a",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 16,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "split",
            avatar: templatePhoto("cover-turntable", "Show artwork"),
            avatarShape: "rounded",
            eyebrow: "A weekly podcast",
            title: "Small Talk, Big Ideas",
            size: "lg",
            subtitle: "New episodes every Thursday.",
          },
        },
        {
          type: "text",
          props: {
            heading: "Ep. 42 · Why the best tools feel invisible",
            body: "Designer Inês Duarte on building things people stop noticing, in the best way. 54 min.",
            card: true,
          },
        },
        {
          type: "links",
          props: {
            items: [
              {
                label: "Apple Podcasts",
                url: "https://podcasts.apple.com/",
                featured: true,
              },
              { label: "Spotify", url: "https://open.spotify.com/" },
              { label: "YouTube", url: "https://youtube.com/" },
              {
                label: "Be a guest",
                description: "Tell us what you're building",
                url: "https://example.com/guest",
              },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "x", url: "https://x.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "shop",
      name: "Shop",
      description: "Product tiles with prices, for makers and small shops",
      theme: {
        colors: {
          background: "#efede6",
          foreground: "#161616",
          primary: "#1f3d2b",
          primaryForeground: "#f4f1ea",
          muted: "#e3e0d6",
          mutedForeground: "#57554d",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 12,
      },
      blocks: [
        {
          type: "header",
          props: {
            avatar: templateMark("logo-second-shutter", "Second Shutter"),
            avatarShape: "rounded",
            eyebrow: "Restored film cameras",
            title: "Second Shutter",
            size: "lg",
            subtitle:
              "Every camera is cleaned, tested and shot with before it ships. 12-month warranty.",
          },
        },
        {
          type: "links",
          props: {
            title: "Just in",
            layout: "grid",
            items: [
              {
                label: "Rangefinder, 1972",
                description: "40mm f/1.7 · $240",
                url: "https://example.com/shop/rangefinder",
                thumbnail: templatePhoto(
                  "tile-camera-rangefinder",
                  "Rangefinder camera",
                ),
              },
              {
                label: "Chrome SLR kit",
                description: "50mm f/1.8 · $310",
                url: "https://example.com/shop/slr-kit",
                thumbnail: templatePhoto("tile-camera-silver", "Silver SLR"),
              },
              {
                label: "Black SLR",
                description: "With strap · $280",
                url: "https://example.com/shop/black-slr",
                thumbnail: templatePhoto("tile-camera-hands", "Black SLR"),
              },
              {
                label: "Twin-lens reflex",
                description: "Medium format · $420",
                url: "https://example.com/shop/tlr",
                thumbnail: templatePhoto(
                  "tile-camera-tlr",
                  "Twin-lens reflex camera",
                ),
              },
            ],
          },
        },
        {
          type: "links",
          props: {
            items: [
              {
                label: "Shop all cameras",
                url: "https://example.com/shop",
                featured: true,
              },
              {
                label: "Sell us your camera",
                url: "https://example.com/sell",
              },
              {
                label: "Repairs and servicing",
                url: "https://example.com/repairs",
              },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [{ network: "instagram", url: "https://instagram.com/" }],
          },
        },
      ],
    },
  ],
});
