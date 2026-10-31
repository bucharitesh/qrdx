import { Contact } from "lucide-react";
import { themePreset } from "@/components/landing/theme";
import { registerTemplate } from "./registry";

const person = {
  firstName: "Alex",
  lastName: "Morgan",
  jobTitle: "Head of Partnerships",
  company: "Northwind Studio",
  bio: "I help brands and creators work together. Let's talk.",
  phones: [{ type: "mobile", number: "+1 555 0100", whatsapp: true }],
  emails: [{ type: "work", address: "alex@example.com" }],
  website: "https://example.com",
  address: {
    street: "500 Market Street",
    city: "San Francisco",
    region: "CA",
    postalCode: "94105",
    country: "USA",
  },
};

registerTemplate({
  type: "vcard",
  label: "vCard Plus",
  description: "Digital business card with a Save contact button",
  icon: Contact,
  order: 30,
  variants: [
    {
      id: "classic",
      name: "Classic",
      description: "Clean card with all your details",
      theme: { colors: themePreset("classic"), radius: 14 },
      blocks: [
        { type: "contact", props: person },
        {
          type: "socials",
          props: {
            items: [
              { network: "linkedin", url: "https://linkedin.com/" },
              { network: "x", url: "https://x.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "midnight",
      name: "Midnight",
      description: "Dark card with portfolio links",
      theme: { colors: themePreset("midnight"), font: "geist", radius: 18 },
      blocks: [
        {
          type: "contact",
          props: {
            ...person,
            firstName: "Priya",
            lastName: "Shah",
            jobTitle: "Product Designer",
            company: "Freelance",
            bio: "Designing calm, useful products. Available for new projects.",
            emails: [{ type: "work", address: "priya@example.com" }],
          },
        },
        {
          type: "links",
          props: {
            title: "Work",
            items: [
              { label: "Portfolio", url: "https://example.com/portfolio" },
              {
                label: "Case study: Fintech app",
                url: "https://example.com/case-study",
              },
            ],
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "linkedin", url: "https://linkedin.com/" },
              { network: "dribbble", url: "https://dribbble.com/" },
              { network: "instagram", url: "https://instagram.com/" },
            ],
          },
        },
      ],
    },
    {
      id: "minimal",
      name: "Minimal",
      description: "Name, number and Save contact",
      theme: { colors: themePreset("sand"), font: "serif", radius: 6 },
      blocks: [
        {
          type: "contact",
          props: {
            firstName: "Jordan",
            lastName: "Lee",
            jobTitle: "Architect",
            company: "Lee & Partners",
            phones: [{ type: "work", number: "+1 555 0100" }],
            emails: [{ type: "work", address: "jordan@example.com" }],
            showShare: false,
          },
        },
      ],
    },
  ],
});
