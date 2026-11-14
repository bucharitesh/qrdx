import { TicketDiscount as TicketPercent } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "coupon",
  label: "Coupon",
  description:
    "A discount code with barcode, validity dates and a redeem button",
  icon: TicketPercent,
  order: 41,
  variants: [
    {
      id: "store-discount",
      name: "Store discount",
      description: "Bold black ticket, scannable at the till or online",
      theme: {
        colors: {
          background: "#111111",
          foreground: "#fafafa",
          primary: "#fafafa",
          primaryForeground: "#111111",
          muted: "#1c1c1c",
          mutedForeground: "#a3a3a3",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 6,
        buttonShape: "sharp",
        texture: "grain",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Northfield Supply Co.",
            title: "Thanks for shopping with us.",
            size: "xl",
            subtitle: "Here's something for your next visit.",
          },
        },
        {
          type: "coupon",
          props: {
            headline: "20% off your next order",
            description: "In store and online, on full-price items.",
            code: "THANKS20",
            barcode: "code128",
            terms:
              "One use per customer. Can't be combined with other offers or exchanged for cash.",
            cta: { label: "Shop online", url: "https://example.com/shop" },
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "tiktok", url: "https://tiktok.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "free-item",
      name: "Free item",
      description: "Photo header; show at the counter and tap Redeem",
      theme: {
        colors: {
          background: "#fbf3ea",
          foreground: "#2b1d14",
          primary: "#a84a24",
          primaryForeground: "#ffffff",
          muted: "#f3e6d6",
          mutedForeground: "#6a5444",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 20,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto(
              "hero-cookies",
              "Cookies and lemons on a dark table",
            ),
            eyebrow: "Sweet Spot Bakery",
            title: "A cookie, on us",
            size: "xl",
            subtitle: "With any coffee, this week only.",
          },
        },
        {
          type: "coupon",
          props: {
            headline: "Free cookie with any coffee",
            code: "COOKIE",
            barcode: "none",
            redeemable: true,
            terms: "Once per visit while stocks last.",
          },
        },
        {
          type: "hours",
          props: { timezone: "" },
        },
        {
          type: "address-map",
          props: {
            title: "Find us",
            name: "Sweet Spot Bakery",
            address: {
              street: "5 Exmouth Market",
              city: "London",
              postalCode: "EC1R 4QL",
              country: "United Kingdom",
            },
          },
        },
      ],
    },
    {
      id: "member-offer",
      name: "Member offer",
      description: "Navy and gold, with an EAN-13 your till can scan",
      theme: {
        colors: {
          background: "#0d1b2a",
          foreground: "#f1f5f9",
          primary: "#e9c46a",
          primaryForeground: "#0d1b2a",
          muted: "#172739",
          mutedForeground: "#a9b6c6",
        },
        font: "dm-sans",
        headingFont: "dm-sans",
        radius: 14,
        background: {
          type: "gradient",
          from: "#1c3352",
          to: "#0d1b2a",
          angle: 180,
          shape: "radial",
        },
        texture: "dots",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Harbor Outfitters members",
            title: "Members' weekend",
            size: "lg",
            subtitle: "Saturday and Sunday only. Thank you for being with us.",
          },
        },
        {
          type: "coupon",
          props: {
            headline: "$10 off when you spend $50",
            description: "Scan at checkout. Valid on one purchase.",
            code: "MEMBER10",
            barcode: "ean13",
            // GS1 prefix 20–29 is reserved for in-store numbers.
            barcodeValue: "200000000010",
            redeemable: true,
            terms: "Excludes gift cards. Limit one per member.",
          },
        },
        {
          type: "links",
          props: {
            style: "rows",
            icons: false,
            items: [
              {
                label: "Find a store",
                url: "https://example.com/stores",
              },
              {
                label: "Your points balance",
                url: "https://example.com/account",
              },
            ],
          },
        },
      ],
    },
  ],
});
