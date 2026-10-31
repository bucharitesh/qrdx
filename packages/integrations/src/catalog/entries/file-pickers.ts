import type { IntegrationCatalogEntry } from "../types";

/** File and page pickers: the share link of the picked item is encoded. */
export const filePickers: IntegrationCatalogEntry[] = [
  {
    slug: "dropbox",
    name: "Dropbox",
    tagline:
      "Pick a Dropbox file or folder and turn its shared link into a QR code.",
    description: [
      "Connect Dropbox and the Website type in the QR editor gets Pick a file. Browse or search your Dropbox, pick a file or folder, and QRdx creates its shared link (or reuses the one it already has). The QR code opens it.",
      "Hosted pages can use Dropbox files too: PDF, audio, video and download blocks get From Dropbox and link straight to the file. If your team only allows team links, QRdx tells you so you can change the link in Dropbox.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["storage"],
    logo: { type: "image", src: "/integrations/dropbox.svg" },
    plan: "free",
    builtBy: "QRdx",
    docs: "/docs/short-links-and-file-pickers",
    website: "https://www.dropbox.com",
    primaryAction: {
      type: "link",
      label: "Connect Dropbox",
      href: "/settings/integrations/dropbox",
    },
    steps: [
      {
        title: "Open the Dropbox integration in QRdx",
        body: "Sign in, then go to Settings → Integrations → Dropbox.",
      },
      {
        title: "Click Enable and allow access",
        body: "QRdx asks to see your files' names and to create shared links, nothing else. Tokens are stored encrypted, and disconnecting revokes them in Dropbox.",
      },
      {
        title: "Pick a file",
        body: "In the editor, choose Website, click Pick a file → Dropbox and choose a file or folder.",
      },
    ],
    capabilities: [
      {
        title: "Shared links",
        description:
          "Creates a link anyone can open, or reuses the file's existing link.",
      },
      {
        title: "Files on hosted pages",
        description:
          "PDF, audio, video and download blocks link straight to the file.",
      },
      {
        title: "Browse and search",
        description: "Folders, search, and paging through large folders.",
      },
    ],
    keywords: ["files", "pdf", "shared link", "folder", "oauth"],
    related: ["onedrive", "box", "google-drive"],
  },
  {
    slug: "onedrive",
    name: "OneDrive",
    tagline:
      "Pick a OneDrive or SharePoint file and encode a view-only sharing link.",
    description: [
      "Connect your Microsoft account and the Website type in the QR editor gets Pick a file. Browse or search your OneDrive (personal, or OneDrive for Business in SharePoint), pick a file or folder, and QRdx creates a view-only “Anyone with the link” link for the QR code.",
      "If your organization turned off “Anyone” links, QRdx creates an organization-only link instead and tells you that only signed-in colleagues can open it.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["storage"],
    logo: { type: "image", src: "/integrations/onedrive.svg" },
    plan: "free",
    builtBy: "QRdx",
    docs: "/docs/short-links-and-file-pickers",
    website: "https://www.microsoft.com/microsoft-365/onedrive",
    primaryAction: {
      type: "link",
      label: "Connect OneDrive",
      href: "/settings/integrations/onedrive",
    },
    steps: [
      {
        title: "Open the OneDrive integration in QRdx",
        body: "Sign in, then go to Settings → Integrations → OneDrive.",
      },
      {
        title: "Click Enable and choose your Microsoft account",
        body: "QRdx asks for access to your files so it can create sharing links (Microsoft requires Files.ReadWrite for that). Tokens are stored encrypted.",
      },
      {
        title: "Pick a file",
        body: "In the editor, choose Website, click Pick a file → OneDrive and choose a file or folder.",
      },
    ],
    capabilities: [
      {
        title: "View-only links",
        description:
          "Anyone with the link can view the file; nobody can edit it.",
      },
      {
        title: "Work and personal accounts",
        description:
          "Personal OneDrive and OneDrive for Business, with organization links where required.",
      },
      {
        title: "Browse and search",
        description: "Your folders and search across your OneDrive.",
      },
    ],
    note: "SharePoint team sites aren't listed; files in your own OneDrive are.",
    keywords: [
      "microsoft",
      "sharepoint",
      "office",
      "files",
      "sharing link",
      "oauth",
    ],
    related: ["dropbox", "box", "google-drive"],
  },
  {
    slug: "box",
    name: "Box",
    tagline:
      "Pick a Box file or folder and turn its shared link into a QR code.",
    description: [
      "Connect Box and the Website type in the QR editor gets Pick a file. Browse or search your Box, pick a file or folder, and QRdx turns on its shared link for people with the link. The QR code opens it.",
      "Where your Box admin only allows company links, QRdx creates one and tells you that only people signed in to your company's Box can open it. Download blocks on hosted pages use the direct download link when Box provides one.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["storage"],
    logo: { type: "image", src: "/integrations/box.svg" },
    plan: "free",
    builtBy: "QRdx",
    docs: "/docs/short-links-and-file-pickers",
    website: "https://www.box.com",
    primaryAction: {
      type: "link",
      label: "Connect Box",
      href: "/settings/integrations/box",
    },
    steps: [
      {
        title: "Open the Box integration in QRdx",
        body: "Sign in, then go to Settings → Integrations → Box.",
      },
      {
        title: "Click Enable and grant access",
        body: "Turning on a shared link changes the file's settings, so Box asks for read and write access. Tokens are stored encrypted, and disconnecting revokes them in Box.",
      },
      {
        title: "Pick a file",
        body: "In the editor, choose Website, click Pick a file → Box and choose a file or folder.",
      },
    ],
    capabilities: [
      {
        title: "Shared links",
        description:
          "“People with the link” access, or a company link when your admin requires it.",
      },
      {
        title: "Files on hosted pages",
        description:
          "Download blocks use Box's direct download link when there is one.",
      },
      {
        title: "Browse and search",
        description: "Folders and search across your Box.",
      },
    ],
    keywords: ["files", "shared link", "folder", "enterprise", "oauth"],
    related: ["dropbox", "onedrive", "google-drive"],
  },
  {
    slug: "notion",
    name: "Notion",
    tagline:
      "Pick a Notion page and encode its public link, with a hint when it isn't published yet.",
    description: [
      "Connect Notion, choose which pages QRdx can see, and the Website type in the QR editor gets Pick a file → Notion. Search those pages and pick one; QRdx encodes its “Publish to web” link so anyone can open it.",
      "Notion's API can't publish a page for you. If the page isn't published, QRdx still uses its Notion link but tells you that only people in your workspace can open it, and how to publish it.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["storage"],
    logo: { type: "image", src: "/integrations/notion.svg" },
    plan: "free",
    builtBy: "QRdx",
    docs: "/docs/short-links-and-file-pickers",
    website: "https://www.notion.com",
    primaryAction: {
      type: "link",
      label: "Connect Notion",
      href: "/settings/integrations/notion",
    },
    steps: [
      {
        title: "Open the Notion integration in QRdx",
        body: "Sign in, then go to Settings → Integrations → Notion.",
      },
      {
        title: "Click Enable and pick the pages to share",
        body: "Notion asks which pages QRdx can see; only those appear in QRdx. Add more later from a page's ••• → Connections.",
      },
      {
        title: "Publish the page, then pick it",
        body: "In Notion, click Share → Publish → Publish to web. Then in the editor choose Website, click Pick a file → Notion and pick the page.",
      },
    ],
    capabilities: [
      {
        title: "Public page links",
        description: "Encodes the page's published notion.site link.",
      },
      {
        title: "Clear hints",
        description:
          "Says when a page isn't published yet, so scans don't hit a sign-in wall.",
      },
      {
        title: "Only pages you choose",
        description: "QRdx sees just the pages you shared with it.",
      },
    ],
    keywords: ["pages", "wiki", "docs", "notion.site", "publish", "oauth"],
    related: ["google-drive", "dropbox", "google-sheets"],
  },
];
