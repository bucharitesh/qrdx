import { CalendarEdit } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// Appointments: services and prices, then a request form (answers reach the
// page's responses and notifications) and, when there is one, a link to the
// owner's booking tool. Requests are confirmed by the business; the page
// doesn't hold a live calendar of free slots.

/** Opening hours, Monday first: [open, close] or null when closed. */
const week = (...days: Array<[string, string] | null>) =>
  days.map((day) =>
    day ? { ranges: [{ open: day[0], close: day[1] }] } : { ranges: [] },
  );

registerTemplate({
  type: "booking",
  label: "Appointments",
  description:
    "Services, prices and a booking request form or your booking link",
  icon: CalendarEdit,
  order: 46,
  variants: [
    {
      id: "salon",
      name: "Salon",
      description: "A price list, a request form and opening hours",
      theme: {
        colors: {
          background: "#f8f3ef",
          foreground: "#271d19",
          primary: "#271d19",
          primaryForeground: "#f8f3ef",
          muted: "#eee4dc",
          mutedForeground: "#66574e",
        },
        font: "dm-sans",
        headingFont: "cormorant",
        radius: 4,
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
            eyebrow: "Hair · Colour · Treatments",
            title: "Atelier Rose",
            size: "xl",
            subtitle: "Book a chair. We'll text you to confirm the time.",
          },
        },
        {
          type: "details",
          props: {
            title: "Services",
            items: [
              { label: "Cut & finish", value: "$70 · 60 min" },
              { label: "Colour", value: "From $95 · 90 min" },
              { label: "Balayage", value: "From $180 · 3 h" },
              { label: "Treatment & blow-dry", value: "$55 · 45 min" },
            ],
          },
        },
        {
          type: "form",
          props: {
            title: "Request an appointment",
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
                id: "service",
                type: "choice",
                label: "Service",
                required: true,
                options: [
                  "Cut & finish",
                  "Colour",
                  "Balayage",
                  "Treatment & blow-dry",
                ],
              },
              {
                id: "when",
                type: "text",
                label: "Days and times that suit you",
                required: true,
                maxLength: 300,
              },
            ],
            submitLabel: "Send request",
            successMessage:
              "Thanks! We'll text you within a few hours to confirm.",
          },
        },
        {
          type: "hours",
          props: {
            days: week(
              null,
              ["10:00", "19:00"],
              ["10:00", "19:00"],
              ["10:00", "20:00"],
              ["10:00", "20:00"],
              ["09:00", "17:00"],
              null,
            ),
          },
        },
        {
          type: "address-map",
          props: {
            title: "",
            name: "Atelier Rose",
            address: {
              street: "220 Elm Street",
              city: "Maple Falls",
              country: "USA",
            },
          },
        },
      ],
    },
    {
      id: "clinic",
      name: "Clinic",
      description: "Treatments, online booking and a call-back form",
      theme: {
        colors: {
          background: "#f1f6f5",
          foreground: "#102320",
          primary: "#1f5f57",
          primaryForeground: "#ffffff",
          muted: "#e0ebe9",
          mutedForeground: "#4b5f5c",
        },
        font: "dm-sans",
        headingFont: "dm-sans",
        radius: 14,
      },
      blocks: [
        {
          type: "header",
          props: {
            align: "left",
            eyebrow: "Physiotherapy & sports massage",
            title: "Harbourside Physio",
            size: "xl",
            subtitle: "Same-week appointments, early mornings and Saturdays.",
          },
        },
        {
          type: "button",
          props: {
            label: "Book online",
            url: "https://example.com/book",
            note: "See every free slot and book in a minute",
          },
        },
        {
          type: "details",
          props: {
            title: "Treatments",
            items: [
              { label: "First assessment", value: "$95 · 45 min" },
              { label: "Follow-up", value: "$75 · 30 min" },
              { label: "Sports massage", value: "$80 · 45 min" },
            ],
          },
        },
        {
          type: "form",
          props: {
            title: "Prefer a call?",
            description: "Leave your number and we'll call you back today.",
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
                id: "reason",
                type: "text",
                label: "What would you like help with?",
                multiline: true,
                maxLength: 1000,
              },
            ],
            submitLabel: "Request a call",
            successMessage: "Thanks! We'll call you back today.",
          },
        },
        {
          type: "hours",
          props: {
            days: week(
              ["07:00", "19:00"],
              ["07:00", "19:00"],
              ["07:00", "19:00"],
              ["07:00", "19:00"],
              ["07:00", "17:00"],
              ["08:00", "13:00"],
              null,
            ),
          },
        },
      ],
    },
    {
      id: "coach",
      name: "Coach & tutor",
      description: "Sessions, a free intro call and questions",
      theme: {
        colors: {
          background: "#fbfbf9",
          foreground: "#171715",
          primary: "#3a3fbd",
          primaryForeground: "#ffffff",
          muted: "#f0f0ec",
          mutedForeground: "#5d5d57",
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
            avatar: templatePhoto("portrait-reader", "Mai reading at home"),
            eyebrow: "Maths & physics tutor",
            title: "Sessions with Mai",
            size: "lg",
            subtitle: "Online or in person, for ages 11 to 18.",
          },
        },
        {
          type: "button",
          props: {
            label: "Book a free 20-minute intro",
            url: "https://example.com/intro",
          },
        },
        {
          type: "details",
          props: {
            items: [
              { label: "One session", value: "$45 · 60 min" },
              { label: "Five sessions", value: "$200" },
              { label: "Exam prep week", value: "$320" },
            ],
          },
        },
        {
          type: "form",
          props: {
            title: "Questions first?",
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
                id: "question",
                type: "text",
                label: "Your question",
                multiline: true,
                maxLength: 1000,
              },
            ],
            submitLabel: "Send",
            successMessage: "Thanks! I'll reply by email within a day.",
          },
        },
      ],
    },
  ],
});
