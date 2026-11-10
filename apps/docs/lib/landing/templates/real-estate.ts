import { House } from "iconsax-reactjs";
import { templateMediaUrl, templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// Listings for a yard sign, a window card or an open-house flyer. Viewing
// requests and sign-ins go to the page's form responses.

/** A gallery photo from the template library. */
const listingPhoto = (name: string, alt: string) => ({
  source: { type: "url" as const, url: templateMediaUrl(`${name}.webp`) },
  alt,
});

registerTemplate({
  type: "real-estate",
  label: "Property listing",
  description:
    "Photos, price, key facts and viewing requests for a home for sale or rent",
  icon: House,
  order: 48,
  variants: [
    {
      id: "for-sale",
      name: "For sale",
      description: "Price, facts, photos and a viewing request form",
      theme: {
        colors: {
          background: "#fbfaf7",
          foreground: "#1c1b18",
          primary: "#1c1b18",
          primaryForeground: "#fbfaf7",
          muted: "#f0eee8",
          mutedForeground: "#5f5d55",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 12,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            align: "left",
            cover: templatePhoto(
              "hero-yellow-house",
              "A yellow brick house with a green front door",
            ),
            eyebrow: "For sale · Open house Saturday 1–3 pm",
            title: "14 Linden Row",
            size: "xl",
            subtitle:
              "A sunny three-bedroom townhouse two minutes from the park.",
          },
        },
        {
          type: "details",
          props: {
            layout: "tiles",
            items: [
              { label: "Price", value: "$865,000" },
              { label: "Bedrooms", value: "3" },
              { label: "Bathrooms", value: "2.5" },
              { label: "Living area", value: "1,850 sq ft" },
              { label: "Lot", value: "2,400 sq ft" },
              { label: "Built", value: "1924" },
            ],
          },
        },
        {
          type: "text",
          props: {
            heading: "About this home",
            body: "Restored brick townhouse with original oak floors, a new kitchen and a south-facing garden. The primary bedroom has its own bath, and the finished basement works as a studio or guest room.",
          },
        },
        {
          type: "gallery",
          props: {
            columns: "2",
            images: [
              listingPhoto("photo-red-door", "The brick side wall and door"),
              listingPhoto(
                "banner-dining-room",
                "A bright dining room with white chairs",
              ),
            ],
          },
        },
        {
          type: "form",
          props: {
            title: "Book a viewing",
            description: "Tell us when suits you and we'll confirm by text.",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Your name",
                required: true,
                maxLength: 120,
              },
              { id: "phone", type: "phone", label: "Phone", required: true },
              {
                id: "when",
                type: "text",
                label: "Days and times that suit you",
                maxLength: 300,
              },
            ],
            submitLabel: "Request a viewing",
            successMessage: "Thanks! We'll text you to confirm a time.",
          },
        },
        {
          type: "contact",
          props: {
            firstName: "Dana",
            lastName: "Whitfield",
            jobTitle: "Listing agent",
            company: "Linden & Co. Realty",
            phones: [{ type: "mobile", number: "+1 555 0148" }],
            emails: [{ type: "work", address: "dana@example.com" }],
            showShare: false,
          },
        },
        {
          type: "address-map",
          props: {
            title: "Location",
            name: "",
            address: {
              street: "14 Linden Row",
              city: "Maple Falls",
              country: "USA",
            },
          },
        },
      ],
    },
    {
      id: "rental",
      name: "For rent",
      description: "Rent, deposit, pets and an inquiry form",
      theme: {
        colors: {
          background: "#f2f5f7",
          foreground: "#13202a",
          primary: "#1d4e6b",
          primaryForeground: "#ffffff",
          muted: "#e3e9ed",
          mutedForeground: "#4c5c68",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 10,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            align: "left",
            cover: templatePhoto(
              "hero-apartments",
              "A row of apartment balconies",
            ),
            eyebrow: "For rent · Available now",
            title: "Apartment 4B, 210 Mercer Street",
            size: "lg",
            subtitle: "$3,400 a month · Two bedrooms with a balcony.",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Rent", value: "$3,400 / month" },
              { label: "Deposit", value: "One month" },
              { label: "Bedrooms", value: "2" },
              { label: "Bathrooms", value: "1" },
              { label: "Size", value: "880 sq ft" },
              { label: "Pets", value: "Cats and small dogs" },
              { label: "Laundry", value: "In the building" },
            ],
          },
        },
        {
          type: "form",
          props: {
            title: "Ask about this apartment",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Your name",
                required: true,
                maxLength: 120,
              },
              { id: "email", type: "email", label: "Email", required: true },
              {
                id: "move-in",
                type: "choice",
                label: "When do you want to move in?",
                options: ["This month", "Next month", "Later"],
              },
              {
                id: "message",
                type: "text",
                label: "Anything else?",
                multiline: true,
                maxLength: 1000,
              },
            ],
            submitLabel: "Send",
            successMessage: "Thanks! We'll reply within a day.",
          },
        },
        {
          type: "button",
          props: {
            label: "Apply online",
            url: "https://example.com/apply",
            style: "outline",
          },
        },
      ],
    },
    {
      id: "open-house",
      name: "Open house sign-in",
      description: "Visitors sign in on their phone instead of a clipboard",
      theme: {
        colors: {
          background: "#111111",
          foreground: "#f4f4f2",
          primary: "#f4f4f2",
          primaryForeground: "#111111",
          muted: "#1d1d1c",
          mutedForeground: "#a7a7a1",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 14,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Open house",
            title: "Welcome to 14 Linden Row",
            size: "xl",
            subtitle: "Sign in and take a look around. Ask us anything.",
          },
        },
        {
          type: "form",
          props: {
            title: "",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Your name",
                required: true,
                maxLength: 120,
              },
              { id: "email", type: "email", label: "Email" },
              { id: "phone", type: "phone", label: "Phone" },
              {
                id: "agent",
                type: "choice",
                label: "Are you working with an agent?",
                options: ["Yes", "No"],
              },
            ],
            submitLabel: "Sign in",
            successMessage: "Thanks for coming. Enjoy the tour!",
          },
        },
        {
          type: "details",
          props: {
            layout: "tiles",
            items: [
              { label: "Price", value: "$865,000" },
              { label: "Bedrooms", value: "3" },
              { label: "Bathrooms", value: "2.5" },
            ],
          },
        },
        {
          type: "button",
          props: {
            label: "See the full listing",
            url: "https://example.com/listing",
          },
        },
      ],
    },
  ],
});
