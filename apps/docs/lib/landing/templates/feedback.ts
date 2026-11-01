import { MessageFavorite as MessageSquareHeart } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// Review links are shown to everyone: never only to visitors who rated well.

registerTemplate({
  type: "feedback",
  label: "Feedback & forms",
  description: "Ratings, NPS surveys and sign-up forms with a response inbox",
  icon: MessageSquareHeart,
  order: 44,
  variants: [
    {
      id: "guest-feedback",
      name: "Guest feedback",
      description: "Star rating, comments and review links",
      theme: {
        colors: {
          background: "#f7f3ec",
          foreground: "#22201b",
          primary: "#3f4a2c",
          primaryForeground: "#ffffff",
          muted: "#ece6da",
          mutedForeground: "#625c4c",
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
            layout: "banner",
            cover: templatePhoto(
              "banner-cafe-tables",
              "Long wooden tables in a café",
            ),
            eyebrow: "Olive & Rye",
            title: "How was your visit?",
            size: "lg",
            subtitle: "Two minutes, and it goes straight to the kitchen.",
          },
        },
        {
          type: "form",
          props: {
            title: "",
            fields: [
              {
                id: "rating",
                type: "stars",
                label: "Overall, how was it?",
                required: true,
              },
              {
                id: "liked",
                type: "choice",
                label: "What stood out?",
                multiple: true,
                options: ["Food", "Service", "Atmosphere", "Value"],
              },
              {
                id: "comments",
                type: "text",
                label: "Anything we could do better?",
                multiline: true,
                maxLength: 1000,
              },
              {
                id: "email",
                type: "email",
                label: "Email",
                help: "Only if you'd like a reply.",
              },
            ],
            submitLabel: "Send feedback",
            successMessage: "Thank you! We read every message.",
          },
        },
        { type: "review-links", props: {} },
      ],
    },
    {
      id: "nps-survey",
      name: "NPS survey",
      description: "Clean 0–10 score with one follow-up question",
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
        radius: 10,
        texture: "grid",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Ledgerly · 30-second survey",
            title: "One quick question",
            size: "lg",
            subtitle: "Your answer goes straight to the product team.",
          },
        },
        {
          type: "form",
          props: {
            title: "",
            fields: [
              {
                id: "nps",
                type: "nps",
                label: "How likely are you to recommend Ledgerly to a friend?",
                required: true,
              },
              {
                id: "reason",
                type: "text",
                label: "What's the main reason for your score?",
                multiline: true,
              },
            ],
            submitLabel: "Submit",
            successMessage: "Thanks for helping us improve!",
          },
        },
      ],
    },
    {
      id: "sign-up",
      name: "Sign-up form",
      description: "Dark newsletter sign-up with interests and consent",
      theme: {
        colors: {
          background: "#111110",
          foreground: "#f5f4ef",
          primary: "#f5f4ef",
          primaryForeground: "#111110",
          muted: "#1f1f1d",
          mutedForeground: "#a9a79f",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 12,
        buttonShape: "pill",
        texture: "grain",
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "The Sunday Letter",
            title: "Stay in the loop",
            size: "xl",
            subtitle:
              "One email a week: new arrivals, events and the odd offer. Unsubscribe any time.",
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
                label: "First name",
                required: true,
                maxLength: 120,
              },
              { id: "email", type: "email", label: "Email", required: true },
              {
                id: "interests",
                type: "choice",
                label: "I'm interested in",
                multiple: true,
                options: ["New arrivals", "Events", "Offers"],
              },
              {
                id: "consent",
                type: "consent",
                label:
                  "I agree to receive emails and can unsubscribe at any time.",
                required: true,
              },
            ],
            submitLabel: "Sign me up",
            successMessage: "You're on the list. See you on Sunday.",
          },
        },
      ],
    },
  ],
});
