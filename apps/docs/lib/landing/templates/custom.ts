import { Element4 as LayoutTemplate } from "iconsax-reactjs";
import { themePreset } from "@/components/landing/theme";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "custom",
  label: "Custom page",
  description: "Start from scratch and build any page from blocks",
  icon: LayoutTemplate,
  // Always last in the picker.
  order: 1000,
  variants: [
    {
      id: "blank",
      name: "Blank",
      description: "A title to start from",
      blocks: [
        {
          type: "header",
          props: { title: "Untitled page", subtitle: "" },
        },
      ],
    },
    {
      id: "announcement",
      name: "Announcement",
      description: "Headline, details and one call to action",
      theme: {
        colors: themePreset("classic"),
        background: {
          type: "gradient",
          from: "#eef4ff",
          to: "#ffffff",
          angle: 180,
        },
        radius: 16,
      },
      blocks: [
        {
          type: "header",
          props: {
            title: "Spring launch event",
            subtitle: "Join us for live demos, food and music.",
          },
        },
        {
          type: "text",
          props: {
            heading: "What to expect",
            body: "Saturday, 10am to 4pm\nFree entry, families welcome\nPrize draw every hour",
            card: true,
          },
        },
        {
          type: "button",
          props: {
            label: "Reserve your spot",
            url: "https://example.com/rsvp",
          },
        },
        { type: "divider", props: { label: "Follow us" } },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "facebook", url: "https://facebook.com/" },
            ],
          },
        },
      ],
    },
  ],
});
