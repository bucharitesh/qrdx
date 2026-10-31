import { FileText } from "lucide-react";
import { themePreset } from "@/components/landing/theme";
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
      description: "One PDF, front and centre",
      theme: { colors: themePreset("classic"), radius: 12 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Product guide",
            subtitle: "Read it here or save a copy for later.",
          },
        },
        { type: "pdf", props: { inline: true, allowDownload: true } },
      ],
    },
    {
      id: "menu",
      name: "Restaurant menu",
      description: "Your printed menu as a PDF, plus opening hours",
      theme: { colors: themePreset("sand"), font: "serif", radius: 16 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Trattoria Sole",
            subtitle: "Today's menu. Ask us about allergens.",
          },
        },
        {
          type: "pdf",
          props: { openLabel: "View menu", allowDownload: false },
        },
        { type: "hours", props: { timezone: "" } },
      ],
    },
    {
      id: "brochure",
      name: "Brochure",
      description: "A brochure with a short intro and a call to action",
      theme: { colors: themePreset("ocean"), radius: 14 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Harbor View Apartments",
            subtitle: "Floor plans, prices and amenities in one brochure.",
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
          },
        },
      ],
    },
  ],
});
