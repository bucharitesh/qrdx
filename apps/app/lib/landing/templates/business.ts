import { Shop as Store } from "iconsax-reactjs";
import { templateMark, templatePhoto } from "./media";
import { registerTemplate } from "./registry";

/** Opening hours, Monday first: [open, close] or null when closed. */
const week = (...days: Array<[string, string] | null>) => ({
  days: days.map((day) =>
    day ? { ranges: [{ open: day[0], close: day[1] }] } : { ranges: [] },
  ),
});

registerTemplate({
  type: "business",
  label: "Business",
  description: "Hours, location, contact details and a call to action",
  icon: Store,
  order: 20,
  variants: [
    {
      id: "local-shop",
      name: "Local shop",
      description: "Photo header, ordering, hours and directions",
      theme: {
        colors: {
          background: "#f4f2ea",
          foreground: "#18201a",
          primary: "#1f4d2e",
          primaryForeground: "#f4f2ea",
          muted: "#e6e5d9",
          mutedForeground: "#525c4c",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 14,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            align: "left",
            cover: templatePhoto(
              "hero-produce",
              "Red onion, herbs and peppercorns on a board",
            ),
            avatar: templateMark("logo-green-leaf", "Green Leaf Market"),
            eyebrow: "Organic grocer · Since 2009",
            title: "Green Leaf Market",
            size: "lg",
            subtitle:
              "Local produce, bread and pantry staples, seven days a week.",
          },
        },
        {
          type: "button",
          props: {
            label: "Order for pickup",
            url: "https://example.com/order",
            note: "Ready in 30 minutes",
          },
        },
        {
          type: "hours",
          props: week(
            ["08:00", "20:00"],
            ["08:00", "20:00"],
            ["08:00", "20:00"],
            ["08:00", "20:00"],
            ["08:00", "21:00"],
            ["09:00", "21:00"],
            ["09:00", "18:00"],
          ),
        },
        {
          type: "address-map",
          props: {
            title: "Find us",
            name: "Green Leaf Market",
            address: {
              street: "1220 SE Belmont Street",
              city: "Portland",
              region: "OR",
              postalCode: "97214",
              country: "USA",
            },
          },
        },
        {
          type: "links",
          props: {
            style: "rows",
            items: [
              { label: "Call the shop", url: "tel:+15035550142" },
              {
                label: "Weekly veg box",
                description: "From $32, delivered on Thursdays",
                url: "https://example.com/veg-box",
              },
              { label: "hello@example.com", url: "mailto:hello@example.com" },
            ],
          },
        },
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
      id: "studio",
      name: "Salon & studio",
      description: "Booking, a price list and opening hours",
      theme: {
        colors: {
          background: "#f7f1ec",
          foreground: "#2a201c",
          primary: "#2a201c",
          primaryForeground: "#f7f1ec",
          muted: "#ede3da",
          mutedForeground: "#685a50",
        },
        font: "dm-sans",
        headingFont: "cormorant",
        radius: 2,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            cover: templatePhoto(
              "banner-golden-hair",
              "Long hair in evening light",
            ),
            avatar: templateMark("logo-nova", "Studio Nova"),
            eyebrow: "Hair · Colour · Care",
            title: "Studio Nova",
            size: "xl",
            subtitle:
              "A calm studio in the 11th. By appointment, Tuesday to Saturday.",
          },
        },
        {
          type: "button",
          props: {
            label: "Book an appointment",
            url: "https://example.com/book",
          },
        },
        {
          type: "links",
          props: {
            title: "Services",
            style: "rows",
            icons: false,
            items: [
              {
                label: "Cut & finish",
                description: "From €65 · 60 min",
                url: "https://example.com/services/cut",
              },
              {
                label: "Colour",
                description: "From €90 · 90 min",
                url: "https://example.com/services/colour",
              },
              {
                label: "Balayage",
                description: "From €160 · 3 h",
                url: "https://example.com/services/balayage",
              },
              {
                label: "Gift cards",
                description: "Any amount, sent by email",
                url: "https://example.com/gift-cards",
              },
            ],
          },
        },
        {
          type: "hours",
          props: week(
            null,
            ["10:00", "19:00"],
            ["10:00", "19:00"],
            ["10:00", "19:00"],
            ["10:00", "20:00"],
            ["09:00", "17:00"],
            null,
          ),
        },
        {
          type: "address-map",
          props: {
            title: "",
            name: "Studio Nova",
            address: {
              street: "48 Rue Oberkampf",
              city: "Paris",
              postalCode: "75011",
              country: "France",
            },
          },
        },
        { type: "divider", props: { style: "ornament" } },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "pinterest", url: "https://pinterest.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "professional",
      name: "Professional services",
      description: "Introduce your firm, list services, take enquiries",
      theme: {
        colors: {
          background: "#f6f7f9",
          foreground: "#0f1b2d",
          primary: "#0f2a4a",
          primaryForeground: "#ffffff",
          muted: "#e8ecf1",
          mutedForeground: "#4c5a6c",
        },
        font: "dm-sans",
        headingFont: "dm-sans",
        radius: 8,
        texture: "grid",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            align: "left",
            cover: templatePhoto(
              "banner-tower",
              "A glass office tower in the mist",
            ),
            avatar: templateMark("logo-harbor", "Harbor & Co."),
            avatarShape: "rounded",
            eyebrow: "Chartered accountants · Boston",
            title: "Harbor & Co.",
            size: "lg",
            subtitle:
              "Tax, bookkeeping and honest advice for small businesses. Fixed monthly fees, no surprises.",
          },
        },
        {
          type: "button",
          props: {
            label: "Book a free 30-minute call",
            url: "https://example.com/consultation",
            note: "By phone or video, usually within two days",
          },
        },
        {
          type: "links",
          props: {
            title: "Services",
            style: "rows",
            icons: false,
            items: [
              {
                label: "Bookkeeping",
                description: "From $290 a month",
                url: "https://example.com/bookkeeping",
              },
              {
                label: "Business and personal tax",
                description: "Federal and state returns",
                url: "https://example.com/tax",
              },
              {
                label: "Payroll",
                description: "Up to 50 employees",
                url: "https://example.com/payroll",
              },
            ],
          },
        },
        {
          type: "contact",
          props: {
            firstName: "Rachel",
            lastName: "Harbor",
            jobTitle: "Managing partner",
            company: "Harbor & Co.",
            phones: [{ type: "work", number: "+1 617 555 0134" }],
            emails: [{ type: "work", address: "office@example.com" }],
            website: "https://example.com",
            address: {
              street: "200 Atlantic Avenue, Suite 4",
              city: "Boston",
              region: "MA",
              postalCode: "02110",
            },
          },
        },
      ],
    },
    {
      id: "florist",
      name: "Florist",
      description: "Dark and botanical, with orders and opening hours",
      theme: {
        colors: {
          background: "#18221c",
          foreground: "#f1ece2",
          primary: "#ecc9b3",
          primaryForeground: "#18221c",
          muted: "#223029",
          mutedForeground: "#b0b6a9",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 20,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto("hero-flowers", "Coral lilies in bloom"),
            avatar: templateMark("logo-petal", "Petal & Stem"),
            eyebrow: "Florist · Brighton",
            title: "Petal & Stem",
            size: "xl",
            subtitle:
              "Seasonal bouquets, weddings and weekly flowers, delivered by bike.",
          },
        },
        {
          type: "links",
          props: {
            items: [
              {
                label: "Order a bouquet",
                description: "Same-day delivery when you order by 1 pm",
                url: "https://example.com/order",
                featured: true,
              },
              {
                label: "Weekly flowers",
                description: "From £28 a week, pause any time",
                url: "https://example.com/subscription",
              },
              {
                label: "Weddings and events",
                url: "https://example.com/weddings",
              },
            ],
          },
        },
        {
          type: "hours",
          props: week(
            ["09:00", "18:00"],
            ["09:00", "18:00"],
            ["09:00", "18:00"],
            ["09:00", "18:00"],
            ["09:00", "18:00"],
            ["09:00", "17:00"],
            ["10:00", "14:00"],
          ),
        },
        {
          type: "address-map",
          props: {
            title: "Visit the shop",
            name: "Petal & Stem",
            address: {
              street: "27 Kensington Gardens",
              city: "Brighton",
              postalCode: "BN1 4AL",
              country: "United Kingdom",
            },
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "pinterest", url: "https://pinterest.com/" },
            ],
          },
        },
      ],
    },
  ],
});
