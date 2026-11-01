import { Gallery as Images } from "iconsax-reactjs";
import { registerTemplate } from "./registry";

// The galleries start empty for the owner's own photos; the public demos fill
// them with sample photos (lib/landing/demo.ts).

registerTemplate({
  type: "images",
  label: "Images",
  description: "A photo gallery that opens full screen",
  icon: Images,
  order: 51,
  variants: [
    {
      id: "gallery",
      name: "Lookbook",
      description: "A two-column grid with a shop link",
      theme: {
        colors: {
          background: "#fbf7f1",
          foreground: "#1d1a16",
          primary: "#1d1a16",
          primaryForeground: "#fbf7f1",
          muted: "#f0e9df",
          mutedForeground: "#655c51",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 4,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Lookbook",
            title: "The summer edit",
            size: "xl",
            subtitle:
              "Light linen, bright fruit and long evenings. Tap a photo to see it full screen.",
          },
        },
        { type: "gallery", props: { columns: "2", shape: "square" } },
        {
          type: "button",
          props: {
            label: "Shop the collection",
            url: "https://example.com/shop",
          },
        },
      ],
    },
    {
      id: "portfolio",
      name: "Portfolio",
      description: "Black and white, three columns, contact links",
      theme: {
        colors: {
          background: "#0b0b0b",
          foreground: "#f2f2f2",
          primary: "#f2f2f2",
          primaryForeground: "#0b0b0b",
          muted: "#171717",
          mutedForeground: "#9e9e9e",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 0,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Architectural photography",
            title: "Noa Berg",
            size: "xl",
            subtitle:
              "Buildings, light and the lines between them. Based in Rotterdam.",
          },
        },
        { type: "gallery", props: { columns: "3", shape: "square" } },
        {
          type: "links",
          props: {
            style: "rows",
            icons: false,
            items: [
              {
                label: "Commission a shoot",
                url: "mailto:studio@example.com",
              },
              {
                label: "Prints and licensing",
                url: "https://example.com/prints",
              },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "behance", url: "https://behance.net/" },
            ],
          },
        },
      ],
    },
    {
      id: "event-photos",
      name: "Event photos",
      description: "Share the night's photos at full size",
      theme: {
        colors: {
          background: "#f5f3ef",
          foreground: "#161616",
          primary: "#161616",
          primaryForeground: "#f5f3ef",
          muted: "#e9e6df",
          mutedForeground: "#5a5852",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 12,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Night Owls live · Brooklyn",
            title: "Thanks for coming!",
            size: "xl",
            subtitle:
              "Here are the photos from the night. Tag us if you share one.",
          },
        },
        { type: "gallery", props: { columns: "1", shape: "original" } },
        { type: "file-download", props: { title: "Download the photos" } },
      ],
    },
  ],
});
