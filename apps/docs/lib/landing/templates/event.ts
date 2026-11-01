import { Calendar1 as CalendarDays } from "iconsax-reactjs";
import { templatePhoto } from "./media";
import { registerTemplate } from "./registry";

// Event start dates are left to the block default (a week from today), so a
// new page never starts out in the past.

registerTemplate({
  type: "event",
  label: "Event",
  description: "Date, venue, tickets and add-to-calendar for an event",
  icon: CalendarDays,
  order: 42,
  variants: [
    {
      id: "party",
      name: "Party & launch",
      description: "Night photo, RSVP and calendar links",
      theme: {
        colors: {
          background: "#0c0c0c",
          foreground: "#f5f5f4",
          primary: "#f5f5f4",
          primaryForeground: "#0c0c0c",
          muted: "#1a1a1a",
          mutedForeground: "#a8a29e",
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
            layout: "hero",
            align: "left",
            cover: templatePhoto("hero-sparkler", "A lit sparkler"),
            eyebrow: "You're invited",
            title: "Studio North turns ten",
            size: "xl",
            subtitle: "Drinks, a DJ set and a first look at our new space.",
          },
        },
        {
          type: "event",
          props: {
            title: "Studio North's 10th birthday",
            description:
              "Doors at 7. Bring a friend, we'll have plenty to go round.",
            venue: "The Warehouse",
            address: "200 East Cesar Chavez Street, Austin, TX",
            timeZone: "America/Chicago",
            organizer: "Studio North",
            cta: { label: "RSVP", url: "https://example.com/rsvp" },
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
      id: "conference",
      name: "Conference",
      description: "Tickets, agenda and a clean grid",
      theme: {
        colors: {
          background: "#f4f4f2",
          foreground: "#111111",
          primary: "#111111",
          primaryForeground: "#ffffff",
          muted: "#e8e8e4",
          mutedForeground: "#5a5a54",
        },
        font: "dm-sans",
        headingFont: "space-grotesk",
        radius: 6,
        texture: "grid",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            align: "left",
            cover: templatePhoto(
              "banner-hall",
              "People silhouetted against tall windows",
            ),
            eyebrow: "Chicago · Two days, two tracks",
            title: "Product Summit",
            size: "xl",
            subtitle:
              "Talks and hands-on workshops for people who build products.",
          },
        },
        {
          type: "event",
          props: {
            title: "Product Summit: opening night",
            description:
              "The evening keynote opens two days of talks and workshops. Drinks on the roof afterwards.",
            timeZone: "America/Chicago",
            venue: "Navy Pier, Festival Hall B",
            address: "600 East Grand Avenue, Chicago, IL",
            organizer: "Product Summit team",
            organizerEmail: "hello@example.com",
            cta: {
              label: "Get tickets · from $249",
              url: "https://example.com/tickets",
            },
          },
        },
        {
          type: "links",
          props: {
            title: "Plan your day",
            style: "rows",
            icons: false,
            items: [
              { label: "Agenda", url: "https://example.com/agenda" },
              {
                label: "Speakers",
                description: "24 speakers from 18 companies",
                url: "https://example.com/speakers",
              },
              { label: "Workshops", url: "https://example.com/workshops" },
              {
                label: "Travel and hotels",
                description: "Discounted rooms until two weeks before",
                url: "https://example.com/travel",
              },
            ],
          },
        },
      ],
    },
    {
      id: "webinar",
      name: "Webinar",
      description: "Online event with a join link and agenda",
      theme: {
        colors: {
          background: "#0a0f1f",
          foreground: "#eef2ff",
          primary: "#c7d2fe",
          primaryForeground: "#0a0f1f",
          muted: "#141b31",
          mutedForeground: "#a5aecb",
        },
        font: "dm-sans",
        headingFont: "dm-sans",
        radius: 14,
        background: {
          type: "gradient",
          from: "#24306a",
          to: "#0a0f1f",
          angle: 180,
          shape: "radial",
        },
      },
      blocks: [
        {
          type: "header",
          props: {
            eyebrow: "Live webinar · 45 minutes",
            title: "From first scan to first sale",
            size: "lg",
            subtitle:
              "How three small shops use QR codes on packaging, receipts and windows.",
          },
        },
        {
          type: "event",
          props: {
            title: "From first scan to first sale",
            description: "A walkthrough with real examples, then live Q&A.",
            onlineUrl: "https://example.com/live",
            organizer: "Customer success team",
            cta: { label: "Save my seat", url: "https://example.com/register" },
          },
        },
        {
          type: "text",
          props: {
            heading: "What you'll learn",
            body: "• Where codes get scanned, and where they don't\n• Writing a call to action people act on\n• Reading your scan analytics\n• Your questions, answered live",
            card: true,
          },
        },
        {
          type: "links",
          props: {
            style: "rows",
            icons: false,
            items: [
              {
                label: "Can't make it? Get the recording",
                url: "https://example.com/recording",
              },
            ],
          },
        },
      ],
    },
    {
      id: "wedding",
      name: "Wedding",
      description: "Soft and romantic, with the day's details and an RSVP form",
      theme: {
        colors: {
          background: "#f8f4ee",
          foreground: "#2c2723",
          primary: "#2c2723",
          primaryForeground: "#f8f4ee",
          muted: "#efe8de",
          mutedForeground: "#675e55",
        },
        font: "dm-sans",
        headingFont: "instrument-serif",
        radius: 10,
        spacing: "relaxed",
      },
      blocks: [
        {
          type: "header",
          props: {
            layout: "banner",
            cover: templatePhoto("banner-blossom", "Pink blossom on a branch"),
            eyebrow: "Together with their families",
            title: "Ana & Theo",
            size: "xl",
            subtitle: "invite you to celebrate their wedding",
          },
        },
        {
          type: "event",
          props: {
            title: "Ana & Theo's wedding",
            description:
              "Ceremony in the garden at seven, then dinner and dancing until late.",
            venue: "Quinta da Serra",
            timeZone: "Europe/Lisbon",
            address: "Estrada da Pena, Sintra, Portugal",
            organizer: "Ana & Theo",
          },
        },
        { type: "divider", props: { style: "ornament" } },
        {
          type: "form",
          props: {
            title: "Will you join us?",
            description: "Please reply by the end of next month.",
            fields: [
              {
                id: "name",
                type: "text",
                label: "Your name",
                required: true,
                maxLength: 120,
              },
              {
                id: "attending",
                type: "choice",
                label: "Can you come?",
                required: true,
                options: ["Joyfully accept", "Regretfully decline"],
              },
              {
                id: "guests",
                type: "choice",
                label: "How many of you?",
                options: ["Just me", "Two of us"],
              },
              {
                id: "dietary",
                type: "text",
                label: "Anything we should know about food?",
                maxLength: 300,
              },
            ],
            submitLabel: "Send RSVP",
            successMessage: "Thank you! We can't wait to celebrate with you.",
          },
        },
        {
          type: "text",
          props: {
            heading: "Good to know",
            body: "Dress code: garden formal.\nA shuttle leaves Sintra station at 3 pm.\nNo gifts please, your company is plenty.",
            align: "center",
          },
        },
      ],
    },
  ],
});
