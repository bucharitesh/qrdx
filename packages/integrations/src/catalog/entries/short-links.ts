import type { IntegrationCatalogEntry } from "../types";

/** Short-link providers: the QR code encodes a link from your own account. */
export const shortLinks: IntegrationCatalogEntry[] = [
  {
    slug: "bitly",
    name: "Bitly",
    tagline:
      "Shorten a QR code's link with your own Bitly account, on bit.ly or your branded domain.",
    description: [
      "Connect Bitly and the Website type in the QR editor gets a Shorten button. QRdx creates the link in your Bitly account (in your default group, on the domain you pick) or lets you pick one you already have, and the QR code encodes that short link.",
      "Because the code holds the Bitly link, you can change where it points later in Bitly and see its clicks there; the printed code stays the same. Settings → Integrations → Bitly shows your groups, domains and recent links.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["links"],
    logo: { type: "image", src: "/integrations/bitly.svg" },
    plan: "free",
    builtBy: "QRdx",
    docs: "/docs/short-links-and-file-pickers",
    website: "https://bitly.com",
    primaryAction: {
      type: "link",
      label: "Connect Bitly",
      href: "/settings/integrations/bitly",
    },
    steps: [
      {
        title: "Open the Bitly integration in QRdx",
        body: "Sign in, then go to Settings → Integrations → Bitly.",
      },
      {
        title: "Sign in with Bitly, or paste an access token",
        body: "Click Enable to approve QRdx in Bitly. Or create a generic access token in Bitly (Settings → Developer settings → API) and paste it. Either way the token is checked with Bitly and stored encrypted.",
      },
      {
        title: "Shorten from the editor",
        body: "Choose the Website type, enter the address, click Shorten, then create a new link or pick an existing one. Bitly chooses the back-half; changing a link's destination later needs a paid Bitly plan.",
      },
    ],
    capabilities: [
      {
        title: "Create Bitly links",
        description:
          "On bit.ly or any branded domain in your account, with an optional title.",
      },
      {
        title: "Reuse existing links",
        description: "Search your Bitly links and encode one in a QR code.",
      },
      {
        title: "Groups and domains",
        description:
          "See your groups and branded domains, and pick the default domain for new links.",
      },
    ],
    keywords: ["bit.ly", "short link", "shortener", "branded domain", "oauth"],
    related: ["rebrandly", "short-io", "dub"],
  },
  {
    slug: "rebrandly",
    name: "Rebrandly",
    tagline:
      "Shorten a QR code's link on your Rebrandly branded domain, with your own slashtag.",
    description: [
      "Connect Rebrandly with an API key and the Website type in the QR editor gets a Shorten button. Create a branded link with the slashtag you want, or pick one of your existing links; the QR code encodes the Rebrandly link.",
      "Change the destination in Rebrandly whenever you need to and the printed code follows it. Settings → Integrations → Rebrandly lets you pick the domain new links use.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["links"],
    logo: { type: "image", src: "/integrations/rebrandly.svg" },
    plan: "free",
    builtBy: "QRdx",
    docs: "/docs/short-links-and-file-pickers",
    website: "https://www.rebrandly.com",
    primaryAction: {
      type: "link",
      label: "Connect Rebrandly",
      href: "/settings/integrations/rebrandly",
    },
    steps: [
      {
        title: "Create an API key in Rebrandly",
        body: "In Rebrandly, open Account → API keys and click New API key.",
      },
      {
        title: "Paste it in QRdx",
        body: "Go to Settings → Integrations → Rebrandly and paste the key. QRdx checks it with Rebrandly and stores it encrypted.",
      },
      {
        title: "Shorten from the editor",
        body: "Choose the Website type, click Shorten, pick the domain and slashtag, or select an existing link.",
      },
    ],
    capabilities: [
      {
        title: "Branded links",
        description:
          "Create links on your own Rebrandly domains, with a custom slashtag.",
      },
      {
        title: "Reuse existing links",
        description: "Pick one of your recent Rebrandly links for a QR code.",
      },
      {
        title: "Default domain",
        description: "Choose which domain new links use in settings.",
      },
    ],
    note: "Connects with an API key from your Rebrandly account.",
    keywords: [
      "rebrand.ly",
      "short link",
      "branded link",
      "slashtag",
      "api key",
    ],
    related: ["bitly", "short-io", "custom-domains"],
  },
  {
    slug: "short-io",
    name: "Short.io",
    tagline:
      "Shorten a QR code's link on your own Short.io domain, with the path you choose.",
    description: [
      "Connect Short.io with a secret API key, pick which of your domains to use, and the Website type in the QR editor gets a Shorten button. Create a link with your own path or pick an existing one; the QR code encodes the Short.io link.",
      "Short.io keeps redirecting and counting clicks, and you can change the destination there later.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["links"],
    logo: { type: "image", src: "/integrations/short-io.svg" },
    plan: "free",
    builtBy: "QRdx",
    docs: "/docs/short-links-and-file-pickers",
    website: "https://short.io",
    primaryAction: {
      type: "link",
      label: "Connect Short.io",
      href: "/settings/integrations/short-io",
    },
    steps: [
      {
        title: "Create a secret API key in Short.io",
        body: "In Short.io, open Integrations & API → API and create a key. Keep it a secret (private) key.",
      },
      {
        title: "Paste it and pick a domain",
        body: "Go to Settings → Integrations → Short.io, paste the key, then choose the domain new links use.",
      },
      {
        title: "Shorten from the editor",
        body: "Choose the Website type, click Shorten, and create a link or select an existing one.",
      },
    ],
    capabilities: [
      {
        title: "Links on your domain",
        description: "Create links on any domain in your Short.io account.",
      },
      {
        title: "Custom paths",
        description:
          "Type the path after the domain, or let Short.io pick one.",
      },
      {
        title: "Domain picker",
        description:
          "Choose the default domain in settings; existing links are listed per domain.",
      },
    ],
    note: "Connects with a secret API key from your Short.io account.",
    keywords: ["short link", "shortener", "branded domain", "api key"],
    related: ["bitly", "rebrandly", "custom-domains"],
  },
];
