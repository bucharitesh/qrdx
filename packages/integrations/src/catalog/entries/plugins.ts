import type { IntegrationCatalogEntry } from "../types";

const REPO = "https://github.com/bucharitesh/qrdx";
const CLONE = `git clone ${REPO}.git\ncd qrdx && pnpm install`;

export const plugins: IntegrationCatalogEntry[] = [
  {
    slug: "chrome",
    name: "Chrome extension",
    tagline:
      "A styled QR code for the current tab, any link, image or selected text, one click away in Chrome.",
    description: [
      "The extension shows a QR code for the page you're on. Edit the value, pick one of 12 style presets, set colors and size, then download a PNG or SVG, copy the image, or open it in QRdx.",
      "Right-click a link, an image or selected text to get its QR code. Everything runs in your browser; nothing is sent anywhere.",
    ],
    kind: "guide",
    surface: "plugins",
    canonicalPath: "/plugins#chrome",
    categories: ["plugins"],
    logo: { type: "image", src: "/integrations/chrome.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://www.google.com/chrome/",
    note: "Not in the Chrome Web Store yet. Install it from source.",
    primaryAction: {
      type: "link",
      label: "View source",
      href: `${REPO}/tree/main/plugins/chrome`,
    },
    steps: [
      {
        title: "Build the extension",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: `${CLONE}\npnpm --filter @qrdx/chrome-extension build`,
        },
      },
      {
        title: "Load it in Chrome",
        body: "Open chrome://extensions, turn on Developer mode, click Load unpacked and select plugins/chrome/dist.",
      },
      {
        title: "Pin QRdx",
        body: "Pin it from the puzzle-piece menu, then click its icon on any page.",
      },
    ],
    capabilities: [
      {
        title: "Current tab or anything you right-click",
        description: "Links, images and selected text from the context menu.",
      },
      {
        title: "12 style presets",
        description:
          "The playground's styles, with your own colors and 256–2048 px exports.",
      },
      {
        title: "PNG, SVG or clipboard",
        description:
          "Download either format, copy the image, or open it in QRdx.",
      },
      {
        title: "Private by design",
        description:
          "Only activeTab, contextMenus and storage permissions; runs entirely in the browser.",
      },
    ],
    keywords: ["browser", "extension", "tab", "context menu", "google"],
    related: ["figma", "raycast", "react"],
  },
  {
    slug: "figma",
    name: "Figma plugin",
    tagline:
      "Insert styled QR codes into Figma as editable vector layers, and update them in place.",
    description: [
      "Enter a URL or text, pick a style preset, colors and size, and the plugin inserts the QR code as vector layers at the center of your viewport. It stays sharp at any zoom.",
      "Select a code you inserted earlier to replace it while keeping its size, position and rotation, or reopen it with the Edit QR code button in Figma's right panel. The plugin has no network access.",
    ],
    kind: "guide",
    surface: "plugins",
    canonicalPath: "/plugins#figma",
    categories: ["plugins"],
    logo: { type: "image", src: "/integrations/figma.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://www.figma.com",
    note: "Not in Figma Community yet. Import it from source.",
    primaryAction: {
      type: "link",
      label: "View source",
      href: `${REPO}/tree/main/plugins/figma`,
    },
    steps: [
      {
        title: "Build the plugin",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: `${CLONE}\npnpm --filter @qrdx/figma-plugin build`,
        },
      },
      {
        title: "Import it in the Figma desktop app",
        body: "Open a design file, then Plugins → Development → Import plugin from manifest… and select plugins/figma/manifest.json.",
      },
      {
        title: "Run it",
        body: "Plugins → Development → QRdx.",
      },
    ],
    capabilities: [
      {
        title: "Vector layers",
        description: "Codes are editable vectors that stay sharp at any size.",
      },
      {
        title: "Replace in place",
        description:
          "Swap a selected code and keep its size, position, rotation and constraints.",
      },
      {
        title: "Edit later",
        description:
          "Each code remembers its content and style behind an Edit QR code button.",
      },
      {
        title: "Offline",
        description: "No network access: nothing leaves Figma.",
      },
    ],
    keywords: ["design", "vector", "plugin", "print", "mockup"],
    related: ["chrome", "raycast", "react"],
  },
  {
    slug: "raycast",
    name: "Raycast extension",
    tagline:
      "Generate, save and export customized QR codes from Raycast, or describe one to Raycast AI.",
    description: [
      "Generate QR codes with body patterns, corner styles, colors, templates and logos from the Raycast launcher, keep a library of saved codes, and export them.",
      "Generate QR with AI turns a plain-English description into settings, and Raycast AI can call the extension's tools directly.",
    ],
    kind: "guide",
    surface: "plugins",
    canonicalPath: "/plugins#raycast",
    categories: ["plugins"],
    logo: { type: "image", src: "/integrations/raycast.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://www.raycast.com",
    note: "Not in the Raycast Store yet. Install it from source.",
    primaryAction: {
      type: "link",
      label: "View source",
      href: `${REPO}/tree/main/plugins/raycast`,
    },
    steps: [
      {
        title: "Install it as a development extension",
        body: "With Raycast installed, run this and Raycast imports the extension.",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: `git clone ${REPO}.git\ncd qrdx/plugins/raycast\nnpm install && npm run dev`,
        },
      },
      {
        title: "Open it from Raycast",
        body: "Search for Generate QR, Saved QR Codes or Generate QR with AI.",
      },
    ],
    capabilities: [
      {
        title: "Generate QR",
        description:
          "Body patterns, corner styles, colors, templates and logos.",
      },
      {
        title: "Saved QR codes",
        description: "Browse, preview, edit and export saved configurations.",
      },
      {
        title: "Generate with AI",
        description:
          "Describe the code in plain English and Raycast AI sets it up.",
      },
    ],
    keywords: ["launcher", "mac", "productivity", "ai", "extension"],
    related: ["chrome", "figma", "claude-code"],
  },
  {
    slug: "canva",
    name: "Canva app",
    tagline:
      "Style a QR code in a Canva side panel and add it to your design in one click.",
    description: [
      "Enter a URL or text, then pick a template, dot, eye and eye-dot patterns, colors from Canva's color picker, error correction and an optional logo. The preview updates as you go.",
      "Add to Design places the code on your page as a 1024 px PNG with alt text.",
    ],
    kind: "guide",
    surface: "plugins",
    canonicalPath: "/plugins#canva",
    categories: ["plugins"],
    logo: { type: "image", src: "/compare/canva-qr.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://www.canva.com",
    note: "Not in the Canva Apps Marketplace yet. Run it from source.",
    primaryAction: {
      type: "link",
      label: "View source",
      href: `${REPO}/tree/main/plugins/canva`,
    },
    steps: [
      {
        title: "Start the app",
        body: "This serves the app at http://localhost:8080.",
        snippet: {
          label: "Terminal",
          language: "bash",
          code: `${CLONE}\npnpm --filter @qrdx/canva-plugin start`,
        },
      },
      {
        title: "Create an app in the Canva Developer Portal",
        body: "At canva.com/developers/apps, create an app and set its Development URL to http://localhost:8080.",
      },
      {
        title: "Preview it",
        body: "Click Preview: the Canva editor opens with QRdx in the side panel.",
      },
    ],
    capabilities: [
      {
        title: "Live preview",
        description: "The code redraws as you change its content or style.",
      },
      {
        title: "Templates and patterns",
        description:
          "Frame templates and body, eye and eye-dot shapes, each shown as a thumbnail.",
      },
      {
        title: "Canva colors",
        description:
          "Foreground, background, eye and dot colors from Canva's color picker.",
      },
      {
        title: "Add to Design",
        description: "A 1024 px PNG with alt text, placed on your page.",
      },
    ],
    keywords: ["design", "canva", "app", "print", "poster", "social"],
    related: ["figma", "chrome", "raycast"],
  },
];
