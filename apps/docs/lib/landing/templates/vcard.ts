import { Personalcard as Contact } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "vcard",
  label: "vCard Plus",
  description: "Digital business card with a Save contact button",
  icon: Contact,
  order: 30,
  variants: [
    {
      id: "classic",
      name: "Classic",
      description: "Crisp black and white with your photo",
      theme: {
        colors: {
          background: "#ffffff",
          foreground: "#0a0a0a",
          primary: "#0a0a0a",
          primaryForeground: "#ffffff",
          muted: "#f4f4f5",
          mutedForeground: "#5d5d63",
        },
        font: "dm-sans",
        headingFont: "dm-sans",
        radius: 14,
      },
      blocks: [
        {
          type: "contact",
          props: {
            photo: templatePhoto("portrait-reader", "Mai Tran"),
            firstName: "Mai",
            lastName: "Tran",
            jobTitle: "Head of Partnerships",
            company: "Northwind Studio",
            bio: "I help brands and creators work together. Coffee is on me.",
            phones: [
              { type: "mobile", number: "+1 415 555 0182", whatsapp: true },
            ],
            emails: [{ type: "work", address: "mai@example.com" }],
            website: "https://example.com",
            address: {
              street: "500 Market Street",
              city: "San Francisco",
              region: "CA",
              postalCode: "94105",
              country: "USA",
            },
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "linkedin", url: "https://linkedin.com/" },
              { network: "x", url: "https://x.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "midnight",
      name: "Midnight",
      description: "Dark card with selected work",
      theme: {
        colors: {
          background: "#0e0e11",
          foreground: "#f4f4f5",
          primary: "#ebe5da",
          primaryForeground: "#0e0e11",
          muted: "#1b1b20",
          mutedForeground: "#a1a1aa",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 18,
        texture: "dots",
      },
      blocks: [
        {
          type: "contact",
          props: {
            photo: templatePhoto("portrait-designer", "Priya Shah"),
            firstName: "Priya",
            lastName: "Shah",
            jobTitle: "Product designer",
            company: "Independent",
            bio: "Calm, useful software for fintech and health. Open to new projects in spring.",
            phones: [{ type: "mobile", number: "+44 20 7946 0321" }],
            emails: [{ type: "work", address: "priya@example.com" }],
            website: "https://example.com",
            showShare: false,
          },
        },
        {
          type: "links",
          props: {
            title: "Selected work",
            style: "rows",
            icons: false,
            items: [
              {
                label: "Onboarding for a savings app",
                description: "Case study · 2025",
                url: "https://example.com/work/onboarding",
              },
              {
                label: "A design system for a clinic network",
                description: "Case study · 2024",
                url: "https://example.com/work/design-system",
              },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "linkedin", url: "https://linkedin.com/" },
              { network: "dribbble", url: "https://dribbble.com/" },
              { network: "instagram", url: "https://instagram.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "minimal",
      name: "Minimal",
      description: "Architectural cover, name and Save contact",
      theme: {
        colors: {
          background: "#f5f2ec",
          foreground: "#1c1a17",
          primary: "#1c1a17",
          primaryForeground: "#f5f2ec",
          muted: "#ebe6dc",
          mutedForeground: "#605b53",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 0,
      },
      blocks: [
        {
          type: "contact",
          props: {
            cover: templatePhoto(
              "banner-flatiron",
              "A narrow corner building against a pale sky",
            ),
            firstName: "Jordan",
            lastName: "Lee",
            jobTitle: "Architect",
            company: "Lee & Partners",
            phones: [{ type: "work", number: "+1 212 555 0147" }],
            emails: [{ type: "work", address: "jordan@example.com" }],
            website: "https://example.com",
            showShare: false,
          },
        },
      ],
    },
    {
      id: "realtor",
      name: "Real estate agent",
      description: "Cover photo, contact details and featured listings",
      theme: {
        colors: {
          background: "#fbfaf8",
          foreground: "#1b1b1b",
          primary: "#6f4f33",
          primaryForeground: "#ffffff",
          muted: "#f1ede7",
          mutedForeground: "#625a51",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 12,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "contact",
          props: {
            cover: templatePhoto(
              "banner-dining-room",
              "A bright dining room with white chairs",
            ),
            firstName: "Elena",
            lastName: "Ruiz",
            jobTitle: "Real estate agent",
            company: "Harbor Realty",
            bio: "Helping families buy and sell in Boston's South End for 12 years.",
            phones: [
              { type: "mobile", number: "+1 617 555 0199", whatsapp: true },
            ],
            emails: [{ type: "work", address: "elena@example.com" }],
            website: "https://example.com",
          },
        },
        {
          type: "links",
          props: {
            title: "Featured listings",
            layout: "grid",
            items: [
              {
                label: "Brick townhouse",
                description: "3 bed · $1,450,000",
                url: "https://example.com/listings/townhouse",
                thumbnail: templatePhoto(
                  "hero-apartments",
                  "Brick townhouses on a corner",
                ),
              },
              {
                label: "Sunny two-bed",
                description: "2 bed · $895,000",
                url: "https://example.com/listings/two-bed",
                thumbnail: templatePhoto(
                  "banner-dining-room",
                  "Bright dining room",
                ),
              },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Get a free home valuation",
            url: "https://example.com/valuation",
            style: "outline",
          },
        },
      ],
    },
  ],
});
