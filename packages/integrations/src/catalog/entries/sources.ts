import type { IntegrationCatalogEntry } from "../types";

// Content sources: list what's already in an account and make a QR code from
// it in one click ("From your account" in the editor and the new-code flow).

export const sources: IntegrationCatalogEntry[] = [
  {
    slug: "stripe",
    name: "Stripe",
    tagline:
      "Pick one of your Stripe Payment Links and print a QR code that opens checkout.",
    description: [
      "Connect Stripe with a restricted key that can only read Payment Links. The URL content type then lists your active links with their name, price and currency, and one click encodes the link.",
      "QRdx never sees payments, customers or balances: the key has Payment Links: Read and nothing else, and test-mode keys are labeled.",
    ],
    kind: "connect",
    categories: ["sources"],
    logo: { type: "image", src: "/integrations/stripe.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://stripe.com/payments/payment-links",
    primaryAction: {
      type: "link",
      label: "Connect Stripe",
      href: "/settings/integrations/stripe",
    },
    secondaryAction: {
      type: "link",
      label: "Create a restricted key",
      href: "https://dashboard.stripe.com/apikeys/create",
    },
    steps: [
      {
        title: "Create a restricted key in Stripe",
        body: "Developers → API keys → Create restricted key. Name it QRdx, set Payment Links to Read and leave every other permission at None.",
        snippet: {
          label: "It looks like this",
          language: "text",
          code: "rk_live_51…",
        },
      },
      {
        title: "Paste it in QRdx",
        body: "Settings → Integrations → Stripe. QRdx checks the key with one read call and stores it encrypted. Full secret keys (sk_…) are refused.",
      },
      {
        title: "Pick a payment link",
        body: "In the editor's URL type or Dashboard → New code, click From your account → Stripe and choose a link.",
      },
    ],
    capabilities: [
      {
        title: "Active Payment Links",
        description: "Name, amount and currency of every active link.",
      },
      {
        title: "Read-only key",
        description:
          "Payment Links: Read only. Delete the key in Stripe to cut access.",
      },
      {
        title: "Static or dynamic",
        description:
          "Encode the link directly, or make a dynamic code you can repoint later.",
      },
    ],
    keywords: ["payments", "checkout", "payment link", "buy", "restricted key"],
    related: ["shopify", "calendly", "rest-api"],
  },
  {
    slug: "shopify",
    name: "Shopify",
    tagline:
      "Search your Shopify products and make a QR code for a product page, or for all of them.",
    description: [
      "Connect your store with an app that has the read_products scope. The URL content type lists your active products with their image and price, and encodes each product's page on your online store (your primary domain).",
      "Need codes for the whole catalog? Download a CSV of every product in the format the bulk importer reads, and create all the dynamic codes at once.",
    ],
    kind: "connect",
    categories: ["sources"],
    logo: { type: "image", src: "/integrations/shopify.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://www.shopify.com",
    primaryAction: {
      type: "link",
      label: "Connect Shopify",
      href: "/settings/integrations/shopify",
    },
    note: "Uses an app you create for your own store; no app store install.",
    steps: [
      {
        title: "Create an app for your store",
        body: "Shopify admin → Settings → Apps → Develop apps → Build apps in Dev Dashboard. Create an app, add the read_products scope, release it and install it on your store.",
      },
      {
        title: "Paste the store domain and credentials",
        body: "Settings → Integrations → Shopify: your store's myshopify.com domain plus the app's client ID and secret (or an Admin API access token from an older custom app). Stored encrypted.",
      },
      {
        title: "Pick a product, or export all",
        body: "Choose From your account → Shopify in the URL type, or download the product CSV and import it under Dashboard → Import.",
      },
    ],
    capabilities: [
      {
        title: "Product search",
        description: "Active products with image and price.",
      },
      {
        title: "Online store links",
        description:
          "Your primary domain's product page; unpublished products are labeled.",
      },
      {
        title: "Bulk codes",
        description: "A CSV of every product for the bulk importer.",
      },
    ],
    keywords: ["store", "products", "ecommerce", "catalog", "bulk"],
    related: ["stripe", "rest-api", "custom-domains"],
  },
  {
    slug: "calcom",
    name: "Cal.com",
    tagline:
      "Pick a Cal.com event type and get a QR code that opens its booking page.",
    description: [
      "Connect Cal.com with an API key and the Cal.com content type lists your event types with their length. One click encodes the booking page, so a scan goes straight to your calendar.",
      "You can still paste any Cal.com booking link without connecting.",
    ],
    kind: "connect",
    categories: ["sources"],
    logo: { type: "image", src: "/integrations/calcom.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://cal.com",
    primaryAction: {
      type: "link",
      label: "Connect Cal.com",
      href: "/settings/integrations/calcom",
    },
    steps: [
      {
        title: "Create an API key in Cal.com",
        body: "Settings → Developer → API keys → Add. Copy the key; Cal.com shows it once.",
        snippet: {
          label: "It looks like this",
          language: "text",
          code: "cal_live_0123abcd…",
        },
      },
      {
        title: "Paste it in QRdx",
        body: "Settings → Integrations → Cal.com. Stored encrypted; delete the key in Cal.com to cut access.",
      },
      {
        title: "Pick an event type",
        body: "In the Cal.com content type, click From your account and choose one.",
      },
    ],
    capabilities: [
      {
        title: "Event types",
        description: "Every visible event type with its length.",
      },
      {
        title: "Booking links",
        description: "The exact booking URL Cal.com gives each event type.",
      },
    ],
    keywords: ["booking", "calendar", "schedule", "meeting", "appointments"],
    related: ["calendly", "stripe"],
  },
  {
    slug: "calendly",
    name: "Calendly",
    tagline:
      "Pick a Calendly event type and get a QR code that opens its scheduling page.",
    description: [
      "Sign in with Calendly and the URL content type lists your active event types. One click encodes the scheduling link, so people can book you from a poster, a table tent or a business card.",
      "QRdx asks only to read your profile and event types.",
    ],
    kind: "connect",
    categories: ["sources"],
    logo: { type: "image", src: "/integrations/calendly.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://calendly.com",
    primaryAction: {
      type: "link",
      label: "Connect Calendly",
      href: "/settings/integrations/calendly",
    },
    steps: [
      {
        title: "Click Enable",
        body: "Settings → Integrations → Calendly, then approve QRdx in Calendly (users:read and event_types:read).",
      },
      {
        title: "Pick an event type",
        body: "In the URL content type or Dashboard → New code, choose From your account → Calendly.",
      },
    ],
    capabilities: [
      {
        title: "Active event types",
        description: "Name and length of each one, with its scheduling link.",
      },
      {
        title: "Read only",
        description:
          "No bookings or invitee data. Disconnect revokes the token.",
      },
    ],
    keywords: ["booking", "calendar", "schedule", "meeting", "oauth"],
    related: ["calcom", "stripe"],
  },
  {
    slug: "youtube",
    name: "YouTube",
    tagline:
      "Paste any YouTube link and QRdx cleans it up: videos, Shorts, playlists, channels and timestamps.",
    description: [
      "The YouTube content type recognizes youtu.be links, Shorts, live streams, embeds, YouTube Music and @handles, keeps the start time and playlist, drops tracking parameters and shows the title and thumbnail before you print.",
      "When this server has a YouTube Data API key, you can also name your channel and pick one of its latest uploads.",
    ],
    kind: "native",
    categories: ["sources"],
    logo: { type: "image", src: "/integrations/youtube.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://www.youtube.com",
    primaryAction: {
      type: "link",
      label: "Make a YouTube QR code",
      href: "/qr-code-generator/youtube",
    },
    steps: [
      {
        title: "Pick the YouTube type and paste a link",
        body: "Any share link works, with or without a timestamp.",
        snippet: {
          label: "All of these work",
          language: "text",
          code: "https://youtu.be/dQw4w9WgXcQ?t=42\nhttps://www.youtube.com/shorts/dQw4w9WgXcQ\nhttps://music.youtube.com/watch?v=dQw4w9WgXcQ\n@channelname",
        },
      },
      {
        title: "Check the preview",
        body: "QRdx shows what the link is (video, Short, playlist, channel) and its title, and offers the clean link.",
      },
    ],
    capabilities: [
      {
        title: "Every link shape",
        description: "youtu.be, Shorts, live, embed, nocookie and Music links.",
      },
      {
        title: "Clean links",
        description: "Start time and playlist kept, tracking removed.",
      },
      {
        title: "Preview",
        description: "Title and thumbnail from YouTube's public oEmbed.",
      },
    ],
    keywords: ["video", "shorts", "channel", "playlist", "music"],
    related: ["spotify", "stripe"],
  },
  {
    slug: "spotify",
    name: "Spotify",
    tagline:
      "Paste any Spotify link or URI and get a clean link with a cover preview.",
    description: [
      "The Spotify content type reads open.spotify.com links (also /intl-xx/ and embed links) and spotify: URIs for songs, albums, artists, playlists, podcasts and audiobooks, removes the ?si= tracking and previews the title and cover art.",
      "When this server has Spotify app credentials, you can paste your profile link and pick one of your public playlists.",
    ],
    kind: "native",
    categories: ["sources"],
    logo: { type: "image", src: "/integrations/spotify.svg" },
    plan: "no-account",
    builtBy: "QRdx",
    website: "https://open.spotify.com",
    primaryAction: {
      type: "link",
      label: "Make a Spotify QR code",
      href: "/qr-code-generator/spotify",
    },
    steps: [
      {
        title: "Pick the Spotify type and paste a link",
        body: "Use Share → Copy link in Spotify, or a spotify: URI.",
        snippet: {
          label: "All of these work",
          language: "text",
          code: "https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT?si=…\nspotify:album:4aawyAB9vmqN3uQ7FjRGTy",
        },
      },
      {
        title: "Check the preview",
        body: "QRdx shows the kind (song, album, playlist…), the title and the cover, and offers the clean link.",
      },
    ],
    capabilities: [
      {
        title: "Links and URIs",
        description: "open.spotify.com, /intl-xx/, embeds and spotify: URIs.",
      },
      {
        title: "Clean links",
        description:
          "Tracking parameters removed, the app opens when installed.",
      },
      {
        title: "Preview",
        description: "Title and cover art from Spotify's public oEmbed.",
      },
    ],
    keywords: ["music", "song", "album", "playlist", "podcast", "artist"],
    related: ["youtube", "stripe"],
  },
];
