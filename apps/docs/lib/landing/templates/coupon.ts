import { TicketDiscount as TicketPercent } from "iconsax-reactjs";
import { themePreset } from "@/components/landing/theme";
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
      description: "Percentage off, scannable at the till or online",
      theme: { colors: themePreset("sunset"), radius: 16 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Thanks for shopping with us",
            subtitle: "Here's a little something for your next visit.",
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
            items: [{ network: "instagram", url: "https://instagram.com/" }],
          },
        },
      ],
    },
    {
      id: "free-item",
      name: "Free item",
      description: "Show at the counter and tap Redeem",
      theme: { colors: themePreset("berry"), font: "rounded", radius: 20 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Sweet Spot Bakery",
            subtitle: "Your free treat is waiting.",
          },
        },
        {
          type: "coupon",
          props: {
            headline: "Free cookie with any coffee",
            code: "COOKIE",
            barcode: "none",
            redeemable: true,
            terms: "Valid once per visit while stocks last.",
          },
        },
        { type: "hours", props: { timezone: "" } },
        {
          type: "address-map",
          props: {
            title: "Visit us",
            name: "Sweet Spot Bakery",
            address: {
              street: "5 Baker Street",
              city: "London",
              postalCode: "NW1 6XE",
              country: "United Kingdom",
            },
          },
        },
      ],
    },
    {
      id: "member-offer",
      name: "Member offer",
      description: "EAN-13 barcode your point of sale can scan",
      theme: { colors: themePreset("ocean"), radius: 12 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Members' weekend",
            subtitle: "Exclusive savings for our loyalty members.",
          },
        },
        {
          type: "coupon",
          props: {
            headline: "$10 off $50",
            description: "Scan at checkout. Valid on one purchase.",
            code: "MEMBER10",
            barcode: "ean13",
            // GS1 prefix 20–29 is reserved for in-store numbers.
            barcodeValue: "200000000010",
            redeemable: true,
            terms: "Excludes gift cards. Limit one per member.",
          },
        },
      ],
    },
  ],
});
