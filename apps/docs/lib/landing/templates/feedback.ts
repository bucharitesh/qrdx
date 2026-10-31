import { MessageSquareHeart } from "lucide-react";
import { themePreset } from "@/components/landing/theme";
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
      theme: { colors: themePreset("forest"), radius: 16 },
      blocks: [
        {
          type: "header",
          props: {
            title: "How did we do?",
            subtitle: "It takes 30 seconds and helps us get better.",
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
                label: "How was your visit?",
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
                help: "Only if you'd like us to reply.",
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
      description: "0–10 recommendation score and a follow-up question",
      theme: { colors: themePreset("classic"), radius: 12 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Quick question",
            subtitle: "Your answer goes straight to our team.",
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
                label: "How likely are you to recommend us to a friend?",
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
      description: "Name, email, interests and consent",
      theme: { colors: themePreset("ocean"), radius: 14 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Stay in the loop",
            subtitle: "News, events and offers. No spam, unsubscribe any time.",
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
                label: "Name",
                required: true,
                maxLength: 120,
              },
              { id: "email", type: "email", label: "Email", required: true },
              { id: "phone", type: "phone", label: "Phone" },
              {
                id: "interests",
                type: "choice",
                label: "I'm interested in",
                multiple: true,
                options: ["Events", "Offers", "Product news"],
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
            successMessage: "You're on the list. See you soon!",
          },
        },
      ],
    },
  ],
});
