import type { IntegrationDefinition } from "../../registry/types";

/**
 * Spotify smart links: no account needed. Optional "your playlists" when the
 * server has Spotify app credentials.
 */
export const spotifyIntegration: IntegrationDefinition = {
  slug: "spotify",
  name: "Spotify",
  description:
    "Paste any Spotify link or URI: songs, albums, artists, playlists and podcasts get a clean link and preview",
  logos: {
    light: "/integrations/spotify.svg",
    dark: "/integrations/spotify.svg",
  },
  category: ["marketing"],
  type: "none",
  capabilities: [
    {
      kind: "manual-url-parser",
      id: "spotify-smart-link",
      label: "Smart Spotify links",
      description:
        "Recognizes open.spotify.com links (also /intl-xx/ and embeds) and spotify: URIs, removes tracking and previews the title and cover.",
      surfaces: ["editor-content-form"],
      requiresConnection: false,
      patterns: [
        {
          id: "spotify-link",
          label: "Spotify link",
          pattern:
            "^https?://(open|play)\\.spotify\\.com/(intl-[a-z-]+/|embed/)?(track|album|artist|playlist|show|episode|audiobook|user)/",
          example:
            "https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT",
          contentType: "spotify",
          targetField: "uri",
        },
        {
          id: "spotify-uri",
          label: "Spotify URI",
          pattern:
            "^spotify:(track|album|artist|playlist|show|episode|audiobook|user):",
          example: "spotify:album:4aawyAB9vmqN3uQ7FjRGTy",
          contentType: "spotify",
          targetField: "uri",
        },
      ],
    },
    {
      kind: "qr-content-source",
      id: "spotify-playlists",
      label: "Your playlists",
      description:
        "Paste your profile link and pick one of your public playlists (when this server has Spotify app credentials).",
      surfaces: ["editor-content-form"],
      requiresConnection: false,
      contentType: "spotify",
      sourceTypes: ["playlist"],
    },
  ],
  features: [
    "Songs, albums, artists, playlists, podcasts and audiobooks",
    "open.spotify.com, /intl-xx/ and embed links, spotify: URIs",
    "Title and cover preview",
  ],
  configurable: false,
  developedBy: "QRdx",
  website: "https://open.spotify.com",
};
