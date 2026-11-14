import { Moneys } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// Ways to pay, tip or donate on one page. Each button opens the payment
// app's own page and details can be copied; QRdx never takes the payment.

registerTemplate({
  type: "payment",
  label: "Payments & tips",
  description:
    "PayPal, Venmo, bank details and more on one page for tips, donations or bills",
  icon: Moneys,
  order: 47,
  variants: [
    {
      id: "tip-jar",
      name: "Tip jar",
      description: "For a band, a barista or a street performer",
      theme: {
        colors: {
          background: "#101010",
          foreground: "#f5f3ef",
          primary: "#f2c46d",
          primaryForeground: "#101010",
          muted: "#1c1b19",
          mutedForeground: "#aaa59b",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 16,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Thanks for listening",
            title: "Tip The Low Tides",
            size: "xl",
            subtitle:
              "Enjoyed the set? Every tip goes straight to the band. Thank you!",
          },
        },
        {
          type: "payment",
          props: {
            action: "tip",
            methods: [
              {
                type: "venmo",
                url: "https://venmo.com/",
                details: "@lowtides",
              },
              {
                type: "cashapp",
                url: "https://cash.app/",
                details: "$lowtides",
              },
              { type: "paypal", url: "https://paypal.me/" },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "instagram", url: "https://instagram.com/" },
              { network: "spotify", url: "https://open.spotify.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "donation",
      name: "Donation",
      description: "A cause, what it pays for and ways to give",
      theme: {
        colors: {
          background: "#f3f6f1",
          foreground: "#15200f",
          primary: "#2f5a1e",
          primaryForeground: "#ffffff",
          muted: "#e3eadd",
          mutedForeground: "#4f5d47",
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
              "hero-seedling",
              "Cupped hands holding fresh pine needles",
            ),
            eyebrow: "Riverside Community Garden",
            title: "Help us plant 500 trees",
            size: "xl",
            subtitle:
              "Every gift buys saplings, mulch and tools for our spring planting days.",
          },
        },
        {
          type: "details",
          props: {
            layout: "tiles",
            items: [
              { label: "$10", value: "One sapling" },
              { label: "$25", value: "A tree guard" },
              { label: "$100", value: "A street of shade" },
            ],
          },
        },
        {
          type: "payment",
          props: {
            title: "Ways to give",
            action: "donate",
            methods: [
              { type: "paypal", url: "https://paypal.me/" },
              {
                type: "bank",
                details:
                  "Account name: Riverside Community Garden\nRouting number: 011000015\nAccount number: 000123456789\nReference: TREES",
              },
            ],
            note: "Would you like a receipt? Email us after you give and we'll send one.",
          },
        },
      ],
    },
    {
      id: "invoice",
      name: "Pay an invoice",
      description: "For freelancers: bank details and payment apps",
      theme: {
        colors: {
          background: "#fafafa",
          foreground: "#111111",
          primary: "#111111",
          primaryForeground: "#ffffff",
          muted: "#efefef",
          mutedForeground: "#5c5c5c",
        },
        font: "geist",
        headingFont: "geist",
        radius: 10,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Design & illustration",
            title: "Pay Lena Fischer",
            size: "lg",
            subtitle: "Please use your invoice number as the reference.",
          },
        },
        {
          type: "payment",
          props: {
            methods: [
              {
                type: "bank",
                details:
                  "Account name: Lena Fischer\nIBAN: DE89 3704 0044 0532 0130 00\nBIC: COBADEFFXXX",
                note: "SEPA transfers usually arrive next day",
              },
              { type: "wise", url: "https://wise.com/" },
              { type: "paypal", url: "https://paypal.me/" },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "Questions about an invoice?",
            url: "mailto:hello@example.com",
            style: "outline",
          },
        },
      ],
    },
  ],
});
