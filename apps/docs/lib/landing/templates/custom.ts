import { Element4 as LayoutTemplate } from "iconsax-reactjs";
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
      theme: {
        colors: {
          background: "#ffffff",
          foreground: "#0a0a0a",
          primary: "#0a0a0a",
          primaryForeground: "#ffffff",
          muted: "#f4f4f5",
          mutedForeground: "#5d5d63",
        },
      },
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
        colors: {
          background: "#fafaf9",
          foreground: "#171717",
          primary: "#171717",
          primaryForeground: "#fafaf9",
          muted: "#efeeec",
          mutedForeground: "#5c5b57",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 16,
        buttonShape: "pill",
        background: {
          type: "gradient",
          from: "#e8e4dc",
          to: "#fafaf9",
          angle: 180,
          shape: "radial",
        },
        texture: "grain",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Saturday · 10 am to 4 pm",
            title: "Spring open day",
            size: "xl",
            subtitle:
              "Live demos, food from local vendors and music all afternoon.",
          },
        },
        {
          type: "text",
          props: {
            heading: "What to expect",
            body: "Free entry, families welcome\nWorkshops every hour, first come first served\nA prize draw at 3 pm",
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
        { type: "divider", props: { style: "ornament", label: "Follow us" } },
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
    {
      id: "coming-soon",
      name: "Coming soon",
      description: "A teaser with an email sign-up for opening day",
      theme: {
        colors: {
          background: "#0e0e0e",
          foreground: "#f5f5f5",
          primary: "#f5f5f5",
          primaryForeground: "#0e0e0e",
          muted: "#1b1b1b",
          mutedForeground: "#a3a3a3",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 12,
        buttonShape: "pill",
        background: {
          type: "gradient",
          from: "#2b2b2b",
          to: "#0e0e0e",
          angle: 180,
          shape: "radial",
        },
        texture: "grain",
        spacing: "relaxed",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Opening this spring",
            title: "Something good is coming to Elm Street",
            size: "xl",
            subtitle:
              "A neighbourhood bakery and coffee bar. Be the first to know when we open.",
          },
        },
        {
          type: "form",
          props: {
            title: "",
            fields: [
              { id: "email", type: "email", label: "Email", required: true },
            ],
            submitLabel: "Tell me when you open",
            successMessage: "You're on the list. See you on opening day.",
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
