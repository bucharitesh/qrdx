import type { IntegrationCatalogEntry } from "../types";

export const linksAndStorage: IntegrationCatalogEntry[] = [
  {
    slug: "dub",
    name: "Dub",
    tagline:
      "Create a Dub short link, or pick one you already have, as the content of a QR code.",
    description: [
      "Connect your Dub workspace and the QR editor can create a new Dub short link or pick an existing one, so the printed code points at a link you track and change in Dub.",
      "Once connected, Settings → Integrations → Dub lists your links with their clicks by day, country, device, browser and OS. You can also paste any Dub short link into the Dub content type without connecting.",
    ],
    kind: "connect",
    categories: ["links"],
    logo: { type: "image", src: "/integrations/dub-icon.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://dub.co",
    primaryAction: {
      type: "link",
      label: "Connect Dub",
      href: "/settings/integrations/dub",
    },
    steps: [
      {
        title: "Open the Dub integration in QRdx",
        body: "Sign in, then go to Settings → Integrations → Dub.",
      },
      {
        title: "Click Enable and approve QRdx in Dub",
        body: "QRdx asks to read and write your workspaces and links. Tokens are stored encrypted, and you can disconnect at any time.",
      },
      {
        title: "Pick Dub as the QR content type",
        body: "In the editor, choose Dub, then create a new short link or select an existing one. The QR code encodes that link.",
      },
    ],
    capabilities: [
      {
        title: "Create or select short links",
        description:
          "Make a new Dub link from the editor or reuse one from your workspace.",
      },
      {
        title: "Click analytics",
        description:
          "See each link's clicks over time and by country, device, browser and OS in settings.",
      },
      {
        title: "Manual Dub URL",
        description:
          "Paste any Dub short link into the Dub content type without connecting an account.",
      },
      {
        title: "Migrate to QRdx",
        description:
          "Import Dub links as dynamic codes in one click, then point the old links at them so printed codes keep working (with undo).",
      },
    ],
    keywords: ["dub.sh", "short link", "shortener", "url", "oauth"],
    related: ["custom-domains", "google-drive", "rest-api"],
  },
  {
    slug: "google-drive",
    name: "Google Drive",
    tagline:
      "Turn Drive files and folders into QR codes, and import Drive images into your designs.",
    description: [
      "Connect Google Drive to browse your files from the QR editor. Pick a document, sheet, slide deck, PDF or folder and QRdx encodes its share link, so a scan opens the file.",
      "Drive images can also be used as QR code assets. Without connecting, you can paste any Drive or Docs link into the Google Drive content type.",
    ],
    kind: "connect",
    categories: ["storage"],
    logo: { type: "image", src: "/integrations/google-drive-icon.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://www.google.com/drive/",
    primaryAction: {
      type: "link",
      label: "Connect Google Drive",
      href: "/settings/integrations/google-drive",
    },
    steps: [
      {
        title: "Open the Google Drive integration in QRdx",
        body: "Sign in, then go to Settings → Integrations → Google Drive.",
      },
      {
        title: "Click Enable and choose your Google account",
        body: "QRdx asks to view your Drive files. Tokens are stored encrypted, and you can disconnect at any time.",
      },
      {
        title: "Pick Google Drive as the QR content type",
        body: "Select a file or folder. People who scan need access to it, so set its sharing to “Anyone with the link” in Drive if the code is public.",
      },
    ],
    capabilities: [
      {
        title: "QR codes for Drive files",
        description:
          "Select Drive files or folders and turn their share links into QR codes.",
      },
      {
        title: "Import Drive images",
        description: "Browse images in your Drive for QR code assets.",
      },
      {
        title: "Manual Drive URL",
        description:
          "Paste a Drive, Docs, Sheets or Slides link without connecting an account.",
      },
    ],
    keywords: ["docs", "sheets", "slides", "pdf", "files", "oauth", "google"],
    related: ["dub", "google-sheets", "custom-domains"],
  },
  {
    slug: "custom-domains",
    name: "Custom domains",
    tagline:
      "Serve your dynamic QR codes' short links from a domain you own, like go.yourbrand.com.",
    description: [
      "Dynamic QR codes encode a short link such as qrdx.dev/q/aB3dE5f. Add a domain and new codes can encode go.yourbrand.com/aB3dE5f instead, so people see your brand before they scan. Redirects, editing and scan analytics work the same way.",
      "Every code keeps working at its default qrdx.dev link too, so codes you already printed never break.",
    ],
    kind: "native",
    categories: ["links"],
    logo: { type: "feature", icon: "Global" },
    plan: "pro",
    builtBy: "QRdx",
    docs: "/docs/custom-domains",
    primaryAction: {
      type: "link",
      label: "Add a domain",
      href: "/dashboard/domains",
    },
    secondaryAction: {
      type: "link",
      label: "Read the docs",
      href: "/docs/custom-domains",
    },
    steps: [
      {
        title: "Add the domain",
        body: "Open Dashboard → Domains and enter it. A subdomain such as go.yourbrand.com works best, because your website stays where it is.",
      },
      {
        title: "Create the DNS records at your DNS provider",
        body: "A subdomain gets a CNAME record and a root domain an A record. Copy the exact values from the dashboard.",
        snippet: {
          label: "Example record",
          language: "text",
          code: "Type   Name   Value\nCNAME  go     (shown in your dashboard)",
        },
      },
      {
        title: "Verify and use it",
        body: "Click Verify. Once verified, pick the domain under Short link domain when you create or edit a dynamic code.",
      },
    ],
    capabilities: [
      {
        title: "Branded short links",
        description:
          "Codes encode your domain, with the same redirects and analytics.",
      },
      {
        title: "Nothing breaks",
        description:
          "Every code also keeps its default qrdx.dev link, before and after a move.",
      },
      {
        title: "Team domains",
        description:
          "Owners and admins add domains; every member can use them for codes.",
      },
      {
        title: "API support",
        description:
          "Set domainId when you create or update codes with the REST API.",
      },
      {
        title: "Migrate a branded domain",
        description:
          "Importing from Dub, Bitly, Rebrandly or Short.io can keep your links' back-halves, so they work on QRdx after the DNS switch.",
      },
    ],
    keywords: ["dns", "cname", "branded", "short link", "subdomain"],
    related: ["dub", "rest-api", "webhooks"],
  },
];
