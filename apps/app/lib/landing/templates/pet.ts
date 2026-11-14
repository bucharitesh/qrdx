import { Pet } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// A page for a collar tag. Whoever finds the pet can call or message the
// owner straight away, or leave a note with where they are through the
// form (it reaches the owner's responses and notifications).

registerTemplate({
  type: "pet",
  label: "Pet ID tag",
  description: "A collar tag page that helps whoever finds your pet reach you",
  icon: Pet,
  order: 49,
  variants: [
    {
      id: "dog",
      name: "Dog",
      description: "Photo, call button, medical needs and a found-it form",
      theme: {
        colors: {
          background: "#f6f3ee",
          foreground: "#1f1b16",
          primary: "#1f1b16",
          primaryForeground: "#f6f3ee",
          muted: "#ebe5dc",
          mutedForeground: "#5f574c",
        },
        font: "rounded",
        headingFont: "bricolage",
        radius: 22,
        buttonShape: "pill",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            cover: templatePhoto(
              "hero-puppy",
              "A black Labrador puppy looking up",
            ),
            eyebrow: "If I'm lost, please call my family",
            title: "Hi, I'm Biscuit",
            size: "xl",
            subtitle: "A friendly Labrador who loves people and snacks.",
          },
        },
        {
          type: "button",
          props: {
            label: "Call my owner",
            url: "tel:+15550142",
            note: "Sam answers day and night",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Breed", value: "Labrador Retriever" },
              { label: "Sex", value: "Male, neutered" },
              { label: "Age", value: "3 years" },
              { label: "Microchipped", value: "Yes, any vet can scan it" },
            ],
          },
        },
        {
          type: "text",
          props: {
            heading: "Medical needs",
            body: "Allergic to chicken. Please don't give him treats you don't know.",
            card: true,
          },
        },
        {
          type: "form",
          props: {
            title: "Found Biscuit?",
            description:
              "Tell us where you are and we'll come to you. Thank you!",
            fields: [
              {
                id: "where",
                type: "text",
                label: "Where are you?",
                required: true,
                maxLength: 300,
              },
              {
                id: "phone",
                type: "phone",
                label: "Your phone number",
                required: true,
              },
              {
                id: "note",
                type: "text",
                label: "Anything else?",
                multiline: true,
                maxLength: 1000,
              },
            ],
            submitLabel: "Send to Biscuit's family",
            successMessage: "Thank you! Sam will call you as soon as possible.",
          },
        },
        {
          type: "contact",
          props: {
            firstName: "Sam",
            lastName: "Rivera",
            jobTitle: "Biscuit's owner",
            company: "",
            phones: [{ type: "mobile", number: "+1 555 0142", whatsapp: true }],
            emails: [{ type: "home", address: "sam@example.com" }],
            showSave: false,
            showShare: false,
          },
        },
      ],
    },
    {
      id: "cat",
      name: "Cat",
      description: "Calm and simple: who I am and who to call",
      theme: {
        colors: {
          background: "#f3f1f8",
          foreground: "#1d1a26",
          primary: "#4b3f72",
          primaryForeground: "#ffffff",
          muted: "#e6e2f0",
          mutedForeground: "#5a5470",
        },
        font: "dm-sans",
        headingFont: "fraunces",
        radius: 18,
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Indoor cat, please call if you find me",
            title: "Miso",
            size: "xl",
            subtitle: "Grey tabby with white paws. Shy at first.",
          },
        },
        {
          type: "button",
          props: {
            label: "Call Jo",
            url: "tel:+15550163",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Age", value: "5 years" },
              { label: "Sex", value: "Female, spayed" },
              { label: "Microchipped", value: "Yes" },
              { label: "Diet", value: "Kidney-care food only" },
            ],
          },
        },
        {
          type: "form",
          props: {
            title: "Found Miso?",
            fields: [
              {
                id: "where",
                type: "text",
                label: "Where did you find her?",
                required: true,
                maxLength: 300,
              },
              {
                id: "phone",
                type: "phone",
                label: "Your phone number",
                required: true,
              },
            ],
            submitLabel: "Send",
            successMessage: "Thank you! Jo will be in touch very soon.",
          },
        },
      ],
    },
    {
      id: "lost",
      name: "Lost pet",
      description: "For posters: last seen, a reward and sightings",
      theme: {
        colors: {
          background: "#fffbf0",
          foreground: "#1a1712",
          primary: "#a52a12",
          primaryForeground: "#ffffff",
          muted: "#f6eedb",
          mutedForeground: "#5d5545",
        },
        font: "dm-sans",
        headingFont: "bricolage",
        radius: 12,
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "hero",
            align: "left",
            cover: templatePhoto(
              "hero-pug",
              "A pug wrapped in a checked blanket",
            ),
            eyebrow: "Lost · Last seen near Riverside Park",
            title: "Have you seen Peanut?",
            size: "xl",
            subtitle:
              "Small fawn pug, shy but friendly. Please don't chase him. Reward offered.",
          },
        },
        {
          type: "button",
          props: {
            label: "Call Jess",
            url: "tel:+15550171",
          },
        },
        {
          type: "form",
          props: {
            title: "Report a sighting",
            fields: [
              {
                id: "where",
                type: "text",
                label: "Where did you see him?",
                required: true,
                maxLength: 300,
              },
              {
                id: "when",
                type: "text",
                label: "When?",
                required: true,
                maxLength: 120,
              },
              { id: "phone", type: "phone", label: "Your phone number" },
            ],
            submitLabel: "Send sighting",
            successMessage: "Thank you for helping us bring Peanut home.",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "Breed", value: "Pug" },
              { label: "Color", value: "Fawn with a black face" },
              { label: "Size", value: "Small, about 8 kg" },
            ],
          },
        },
      ],
    },
  ],
});
