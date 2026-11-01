import { DocumentText as FileText } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "pdf",
  label: "PDF",
  description: "A menu, brochure or manual people can read and download",
  icon: FileText,
  order: 50,
  variants: [
    {
      id: "document",
      name: "Document",
      description: "A guide or manual, front and centre",
      theme: {
        colors: {
          background: "#fafafa",
          foreground: "#111111",
          primary: "#111111",
          primaryForeground: "#ffffff",
          muted: "#efefef",
          mutedForeground: "#5c5c5c",
        },
        font: "dm-sans",
        headingFont: "dm-sans",
        radius: 10,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            align: "left",
            cover: templatePhoto(
              "banner-flatlay",
              "Gadgets laid out on a white desk",
            ),
            eyebrow: "Aero 2 · User guide",
            title: "Everything in the box",
            size: "lg",
            subtitle: "Setup, care and warranty. Read it here or save a copy.",
          },
        },
        { type: "pdf", props: { inline: true, allowDownload: true } },
        {
          type: "links",
          props: {
            title: "Need a hand?",
            style: "rows",
            icons: false,
            items: [
              {
                label: "Register your warranty",
                url: "https://example.com/warranty",
              },
              {
                label: "Contact support",
                description: "Replies within one working day",
                url: "mailto:support@example.com",
              },
            ],
          },
        },
      ],
    },
    {
      id: "menu",
      name: "Restaurant menu",
      description: "Your printed menu as a PDF, plus opening hours",
      theme: {
        colors: {
          background: "#f8f3ea",
          foreground: "#2a2118",
          primary: "#8c2f1b",
          primaryForeground: "#ffffff",
          muted: "#efe6d8",
          mutedForeground: "#675746",
        },
        font: "dm-sans",
        headingFont: "cormorant",
        radius: 4,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            cover: templatePhoto("banner-cups", "Cups on a rustic table"),
            eyebrow: "Today's menu",
            title: "Trattoria Sole",
            size: "xl",
            subtitle: "Ask us about allergens and today's specials.",
          },
        },
        {
          type: "pdf",
          props: { openLabel: "View the menu", allowDownload: false },
        },
        { type: "hours", props: { timezone: "" } },
      ],
    },
    {
      id: "brochure",
      name: "Brochure",
      description: "Photo header, a brochure and a call to action",
      theme: {
        colors: {
          background: "#f3f5f7",
          foreground: "#0f172a",
          primary: "#0f172a",
          primaryForeground: "#ffffff",
          muted: "#e4e8ee",
          mutedForeground: "#4f5d72",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 14,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            align: "left",
            cover: templatePhoto(
              "hero-apartments",
              "Red-brick apartment buildings on a corner",
            ),
            eyebrow: "New homes · South End",
            title: "Harbor View",
            size: "xl",
            subtitle:
              "24 apartments, one to three bedrooms. Move in from spring.",
          },
        },
        {
          type: "pdf",
          props: { title: "Brochure", openLabel: "Open brochure" },
        },
        {
          type: "button",
          props: {
            label: "Book a viewing",
            url: "https://example.com/book",
            note: "Saturdays 10 am – 4 pm, or by appointment",
          },
        },
      ],
    },
  ],
});
