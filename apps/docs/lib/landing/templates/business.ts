import { Shop as Store } from "iconsax-reactjs";
import { themePreset } from "@/components/landing/theme";
import { registerTemplate } from "./registry";

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
      description: "Opening hours, directions and ordering",
      theme: { colors: themePreset("forest"), radius: 14 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Green Leaf Market",
            subtitle: "Fresh local produce, open seven days a week.",
          },
        },
        {
          type: "button",
          props: {
            label: "Order for pickup",
            url: "https://example.com/order",
          },
        },
        { type: "hours", props: { timezone: "" } },
        {
          type: "address-map",
          props: {
            title: "Find us",
            name: "Green Leaf Market",
            address: {
              street: "12 Orchard Lane",
              city: "Portland",
              region: "OR",
              postalCode: "97205",
              country: "USA",
            },
          },
        },
        {
          type: "contact",
          props: {
            firstName: "",
            lastName: "",
            jobTitle: "",
            company: "Green Leaf Market",
            phones: [{ type: "work", number: "+1 555 0100" }],
            emails: [{ type: "work", address: "hello@example.com" }],
            website: "https://example.com",
            showShare: false,
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
      description: "Booking, prices and opening hours",
      theme: { colors: themePreset("sand"), font: "serif", radius: 20 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Studio Nova",
            subtitle: "Hair, color and care by appointment.",
          },
        },
        {
          type: "links",
          props: {
            items: [
              {
                label: "Book an appointment",
                url: "https://example.com/book",
                featured: true,
              },
              { label: "Price list", url: "https://example.com/prices" },
              { label: "Gift cards", url: "https://example.com/gift-cards" },
            ],
          },
        },
        {
          type: "hours",
          props: {
            days: [
              { ranges: [] },
              { ranges: [{ open: "10:00", close: "19:00" }] },
              { ranges: [{ open: "10:00", close: "19:00" }] },
              { ranges: [{ open: "10:00", close: "19:00" }] },
              { ranges: [{ open: "10:00", close: "20:00" }] },
              { ranges: [{ open: "09:00", close: "16:00" }] },
              { ranges: [] },
            ],
          },
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
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "whatsapp", url: "https://wa.me/15550100" },
            ],
          },
        },
      ],
    },
    {
      id: "professional",
      name: "Professional services",
      description: "Introduce your firm and get enquiries",
      theme: { colors: themePreset("ocean"), font: "geist", radius: 10 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Harbor & Co. Accountants",
            subtitle: "Tax, bookkeeping and advice for small businesses.",
            align: "left",
          },
        },
        {
          type: "text",
          props: {
            heading: "How we help",
            body: "Year-round bookkeeping, tax returns and honest advice, with a fixed monthly fee and no surprises.",
          },
        },
        {
          type: "button",
          props: {
            label: "Book a free consultation",
            url: "https://example.com/consultation",
            note: "30 minutes, by phone or video",
          },
        },
        {
          type: "contact",
          props: {
            firstName: "",
            lastName: "",
            jobTitle: "",
            company: "Harbor & Co. Accountants",
            phones: [{ type: "work", number: "+1 555 0100" }],
            emails: [{ type: "work", address: "office@example.com" }],
            website: "https://example.com",
            address: {
              street: "200 Harbor Street",
              city: "Boston",
              region: "MA",
              postalCode: "02110",
            },
          },
        },
      ],
    },
  ],
});
