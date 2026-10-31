import { CalendarDays } from "lucide-react";
import { themePreset } from "@/components/landing/theme";
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
      description: "Venue, RSVP button and calendar links",
      theme: { colors: themePreset("berry"), radius: 18 },
      blocks: [
        {
          type: "header",
          props: {
            title: "You're invited",
            subtitle: "Join us to celebrate the launch of our new space.",
          },
        },
        {
          type: "event",
          props: {
            title: "Launch party",
            description: "Drinks, snacks and a DJ set. Bring a friend!",
            venue: "The Warehouse",
            address: "200 River Road, Austin, TX",
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
      description: "Tickets, agenda and speakers",
      theme: { colors: themePreset("classic"), radius: 12 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Product Summit",
            subtitle: "A day of talks and workshops for product teams.",
          },
        },
        {
          type: "event",
          props: {
            title: "Product Summit",
            description:
              "Keynotes in the morning, hands-on workshops after lunch.",
            venue: "Convention Center, Hall B",
            address: "1 Exhibition Way, Chicago, IL",
            organizer: "Product Summit team",
            organizerEmail: "hello@example.com",
            cta: { label: "Get tickets", url: "https://example.com/tickets" },
          },
        },
        {
          type: "links",
          props: {
            title: "Plan your day",
            items: [
              { label: "Agenda", url: "https://example.com/agenda" },
              { label: "Speakers", url: "https://example.com/speakers" },
              { label: "Travel and hotels", url: "https://example.com/travel" },
            ],
          },
        },
      ],
    },
    {
      id: "webinar",
      name: "Webinar",
      description: "Online event with a join link",
      theme: { colors: themePreset("midnight"), radius: 14 },
      blocks: [
        {
          type: "event",
          props: {
            title: "Live webinar: Getting started",
            description: "A 45-minute walkthrough with time for questions.",
            onlineUrl: "https://example.com/live",
            organizer: "Customer success team",
            cta: { label: "Save my seat", url: "https://example.com/register" },
          },
        },
        {
          type: "text",
          props: {
            heading: "What you'll learn",
            body: "• Setting up your account\n• Tips from power users\n• Live Q&A",
            card: true,
          },
        },
      ],
    },
  ],
});
