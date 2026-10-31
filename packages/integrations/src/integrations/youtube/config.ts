import type { IntegrationDefinition } from "../../registry/types";

/**
 * YouTube smart links: no account needed. Optional "your channel's videos"
 * when the server has a YouTube Data API key.
 */
export const youtubeIntegration: IntegrationDefinition = {
  slug: "youtube",
  name: "YouTube",
  description:
    "Paste any YouTube link: videos, Shorts, playlists and channels are cleaned up with a preview",
  logos: {
    light: "/integrations/youtube.svg",
    dark: "/integrations/youtube.svg",
  },
  category: ["marketing"],
  type: "none",
  capabilities: [
    {
      kind: "manual-url-parser",
      id: "youtube-smart-link",
      label: "Smart YouTube links",
      description:
        "Recognizes youtu.be, Shorts, live, embed, music.youtube.com and timestamp links, removes tracking and previews the title and thumbnail.",
      surfaces: ["editor-content-form"],
      requiresConnection: false,
      patterns: [
        {
          id: "youtube-video",
          label: "YouTube video or Short",
          pattern:
            "^https?://((www|m|music)\\.)?(youtube\\.com/(watch\\?|shorts/|live/|embed/)|youtu\\.be/)",
          example: "https://youtu.be/dQw4w9WgXcQ?t=42",
          contentType: "youtube",
          targetField: "videoUrl",
        },
        {
          id: "youtube-playlist",
          label: "YouTube playlist",
          pattern: "^https?://((www|m|music)\\.)?youtube\\.com/playlist\\?",
          example: "https://www.youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
          contentType: "youtube",
          targetField: "videoUrl",
        },
        {
          id: "youtube-channel",
          label: "YouTube channel",
          pattern:
            "^(@[A-Za-z0-9._-]{3,30}|https?://((www|m)\\.)?youtube\\.com/(@|channel/|c/|user/))",
          example: "https://www.youtube.com/@qrdx",
          contentType: "youtube",
          targetField: "channelUrl",
        },
      ],
    },
    {
      kind: "qr-content-source",
      id: "youtube-channel-videos",
      label: "Your channel's videos",
      description:
        "Name your channel and pick one of its latest uploads (when this server has a YouTube Data API key).",
      surfaces: ["editor-content-form"],
      requiresConnection: false,
      contentType: "youtube",
      sourceTypes: ["video"],
    },
  ],
  features: [
    "youtu.be, Shorts, live, embed and YouTube Music links",
    "Keeps timestamps and playlists, drops tracking parameters",
    "Title and thumbnail preview",
  ],
  configurable: false,
  developedBy: "QRdx",
  website: "https://www.youtube.com",
};
