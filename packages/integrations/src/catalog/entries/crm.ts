import type { CatalogCapability, IntegrationCatalogEntry } from "../types";

// Data out: form responses from hosted pages into CRMs and email lists.

const DELIVERY: CatalogCapability = {
  title: "Delivered reliably",
  description:
    "Batched, retried with backoff for about two days, never sent twice, with the last sync shown in settings.",
};

export const crm: IntegrationCatalogEntry[] = [
  {
    slug: "hubspot",
    name: "HubSpot",
    tagline:
      "Every form response on your hosted pages creates or updates a HubSpot contact.",
    description: [
      "Connect HubSpot, choose the pages, and map each form's questions to contact properties. Email, name and phone are suggested for you. New responses then upsert a contact by email, so the same person never becomes two contacts.",
      "QRdx asks only to write contacts (crm.objects.contacts.write), and only questions you map are sent.",
    ],
    kind: "connect",
    categories: ["crm"],
    logo: { type: "image", src: "/integrations/hubspot.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://www.hubspot.com",
    primaryAction: {
      type: "link",
      label: "Connect HubSpot",
      href: "/settings/integrations/hubspot",
    },
    steps: [
      {
        title: "Click Enable and pick your HubSpot account",
        body: "Settings → Integrations → HubSpot. Approve contacts write access.",
      },
      {
        title: "Choose pages and map fields",
        body: "Pick the hosted pages whose forms should reach HubSpot, check the suggested mapping, and turn the sync on.",
      },
      {
        title: "New responses become contacts",
        body: "Responses after you turn it on are sent within minutes. Responses without an email are skipped.",
      },
    ],
    capabilities: [
      {
        title: "Upsert by email",
        description: "One contact per person, updated by later responses.",
      },
      {
        title: "Field mapping",
        description:
          "Email, name, phone, company and more, with suggested defaults.",
      },
      DELIVERY,
    ],
    keywords: ["crm", "contacts", "leads", "forms", "oauth"],
    related: ["mailchimp", "google-sheets", "webhooks"],
  },
  {
    slug: "mailchimp",
    name: "Mailchimp",
    tagline:
      "Add people who fill in your forms to a Mailchimp audience, with tags, respecting consent.",
    description: [
      "Connect Mailchimp, pick an audience and tags, and map each form's questions to merge fields. Each new response adds or updates a member.",
      "Consent comes first: with a consent checkbox on the form, only people who tick it are subscribed. Without one, people get Mailchimp's confirmation email (double opt-in) or are skipped, as you choose. Nobody who unsubscribed is ever re-subscribed, and only questions the form asked are sent.",
    ],
    kind: "connect",
    categories: ["crm"],
    logo: { type: "image", src: "/integrations/mailchimp.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://mailchimp.com",
    primaryAction: {
      type: "link",
      label: "Connect Mailchimp",
      href: "/settings/integrations/mailchimp",
    },
    steps: [
      {
        title: "Click Enable and log in to Mailchimp",
        body: "Settings → Integrations → Mailchimp.",
      },
      {
        title: "Pick the audience, tags and pages",
        body: "Then check the field mapping and the consent checkbox QRdx found on each form.",
      },
      {
        title: "Turn the sync on",
        body: "Responses after that are added within minutes.",
      },
    ],
    capabilities: [
      {
        title: "Audience and tags",
        description: "Members are added or updated with the tags you pick.",
      },
      {
        title: "Consent",
        description:
          "Subscribed only with a ticked consent box; otherwise double opt-in.",
      },
      DELIVERY,
    ],
    keywords: ["email", "newsletter", "audience", "list", "marketing"],
    related: ["hubspot", "google-sheets", "webhooks"],
  },
];
