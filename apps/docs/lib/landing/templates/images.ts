import { Images } from "lucide-react";
import { themePreset } from "@/components/landing/theme";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "images",
  label: "Images",
  description: "A photo gallery that opens full screen",
  icon: Images,
  order: 51,
  variants: [
    {
      id: "gallery",
      name: "Photo gallery",
      description: "A grid of photos with a short intro",
      theme: { colors: themePreset("classic"), radius: 12 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Summer collection",
            subtitle: "Tap a photo to see it full screen.",
          },
        },
        { type: "gallery", props: { columns: "2", shape: "square" } },
      ],
    },
    {
      id: "portfolio",
      name: "Portfolio",
      description: "Your work in three columns, with contact links",
      theme: { colors: themePreset("graphite"), font: "geist", radius: 6 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Maya Lin Studio",
            subtitle: "Photography and art direction.",
          },
        },
        { type: "gallery", props: { columns: "3", shape: "square" } },
        {
          type: "button",
          props: { label: "Get in touch", url: "mailto:hello@example.com" },
        },
      ],
    },
    {
      id: "event-photos",
      name: "Event photos",
      description: "Share photos after an event, at full size",
      theme: { colors: themePreset("berry"), radius: 18 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Thanks for coming!",
            subtitle: "Here are the photos from the evening.",
          },
        },
        { type: "gallery", props: { columns: "1", shape: "original" } },
        { type: "file-download", props: { title: "Download the photos" } },
      ],
    },
  ],
});
