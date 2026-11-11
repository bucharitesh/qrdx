/**
 * URL Parser Utility
 * Detects content type from pasted URLs and extracts relevant values
 */

import type { ContentType, QRContentConfig } from "@/types/qr-content";
import {
  isAmazonUrl,
  isGoogleDriveFileUrl,
  isOnDomain,
  parseWebUrl,
} from "@/utils/url-host";

interface ParsedURL {
  type: ContentType;
  config: Partial<QRContentConfig>;
}

/**
 * Parse a URL and detect its content type with extracted values. The site is
 * decided by the address's own hostname, never by text in its path or query.
 */
export function parseURL(url: string): ParsedURL | null {
  const trimmedUrl = url.trim();
  const web = parseWebUrl(trimmedUrl);
  const on = (...domains: string[]) => isOnDomain(web, ...domains);

  // Content types added 2026-11-11, by the link's host
  const linked = linkedContent(web, trimmedUrl);
  if (linked) return linked;

  // Instagram
  if (on("instagram.com", "instagr.am")) {
    const usernameMatch = trimmedUrl.match(
      /(?:instagram\.com|instagr\.am)\/([^/?]+)/,
    );
    if (usernameMatch?.[1]) {
      return {
        type: "instagram",
        config: { type: "instagram", username: usernameMatch[1] },
      };
    }
  }

  // Facebook
  if (on("facebook.com", "fb.com")) {
    return {
      type: "facebook",
      config: { type: "facebook", profileUrl: trimmedUrl },
    };
  }

  // Twitter/X
  if (on("twitter.com", "x.com") || trimmedUrl.match(/^@\w+$/)) {
    const usernameMatch = trimmedUrl.match(/(?:twitter\.com|x\.com)\/([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "twitter",
        config: { type: "twitter", username: usernameMatch[1] },
      };
    }
    // Handle @username format
    if (trimmedUrl.match(/^@\w+$/)) {
      return {
        type: "twitter",
        config: { type: "twitter", username: trimmedUrl },
      };
    }
  }

  // LinkedIn
  if (on("linkedin.com")) {
    return {
      type: "linkedin",
      config: { type: "linkedin", profileUrl: trimmedUrl },
    };
  }

  // TikTok
  if (on("tiktok.com")) {
    const usernameMatch = trimmedUrl.match(/tiktok\.com\/@([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "tiktok",
        config: { type: "tiktok", username: `@${usernameMatch[1]}` },
      };
    }
  }

  // YouTube
  if (on("youtube.com", "youtu.be")) {
    // Check if it's a video or channel (youtu.be links are always videos)
    if (
      trimmedUrl.includes("/watch") ||
      on("youtu.be") ||
      trimmedUrl.includes("/shorts/")
    ) {
      return {
        type: "youtube",
        config: { type: "youtube", videoUrl: trimmedUrl, channelUrl: "" },
      };
    }
    return {
      type: "youtube",
      config: { type: "youtube", channelUrl: trimmedUrl, videoUrl: "" },
    };
  }

  // Reddit
  if (on("reddit.com")) {
    const subredditMatch = trimmedUrl.match(/reddit\.com\/r\/([^/?]+)/);
    const userMatch = trimmedUrl.match(/reddit\.com\/u(?:ser)?\/([^/?]+)/);

    if (subredditMatch?.[1]) {
      return {
        type: "reddit",
        config: { type: "reddit", subreddit: subredditMatch[1], username: "" },
      };
    }
    if (userMatch?.[1]) {
      return {
        type: "reddit",
        config: { type: "reddit", username: userMatch[1], subreddit: "" },
      };
    }
  }

  // Pinterest
  if (on("pinterest.com")) {
    const usernameMatch = trimmedUrl.match(/pinterest\.com\/([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "pinterest",
        config: { type: "pinterest", username: usernameMatch[1] },
      };
    }
  }

  // Snapchat
  if (on("snapchat.com")) {
    const usernameMatch = trimmedUrl.match(/snapchat\.com\/add\/([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "snapchat",
        config: { type: "snapchat", username: usernameMatch[1] },
      };
    }
  }

  // Threads
  if (on("threads.net")) {
    const usernameMatch = trimmedUrl.match(/threads\.net\/@([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "threads",
        config: { type: "threads", username: `@${usernameMatch[1]}` },
      };
    }
  }

  // Spotify
  if (on("spotify.com") || trimmedUrl.startsWith("spotify:")) {
    return {
      type: "spotify",
      config: { type: "spotify", uri: trimmedUrl },
    };
  }

  // Venmo
  if (on("venmo.com")) {
    const usernameMatch = trimmedUrl.match(/venmo\.com\/([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "venmo",
        config: {
          type: "venmo",
          username: usernameMatch[1],
          amount: "",
          note: "",
        },
      };
    }
  }

  // PayPal
  if (on("paypal.com", "paypal.me")) {
    return {
      type: "paypal",
      config: { type: "paypal", paypalUrl: trimmedUrl },
    };
  }

  // Amazon
  if (isAmazonUrl(web)) {
    return {
      type: "amazon",
      config: { type: "amazon", productUrl: trimmedUrl },
    };
  }

  // Flipkart
  if (on("flipkart.com")) {
    return {
      type: "flipkart",
      config: { type: "flipkart", productUrl: trimmedUrl },
    };
  }

  // Etsy
  if (on("etsy.com")) {
    return {
      type: "etsy",
      config: { type: "etsy", shopUrl: trimmedUrl },
    };
  }

  // Cal.com
  if (on("cal.com")) {
    return {
      type: "calcom",
      config: { type: "calcom", bookingUrl: trimmedUrl },
    };
  }

  // Dub.sh
  if (on("dub.sh", "dub.co")) {
    return {
      type: "dubsh",
      config: { type: "dubsh", shortUrl: trimmedUrl },
    };
  }

  // Google Forms (Attendance)
  if (
    (on("docs.google.com") && web?.pathname.startsWith("/forms")) ||
    on("forms.gle")
  ) {
    return {
      type: "attendance",
      config: { type: "attendance", formUrl: trimmedUrl },
    };
  }

  // Google Drive and Google Workspace files
  if (isGoogleDriveFileUrl(web)) {
    return {
      type: "google-drive",
      config: {
        type: "google-drive",
        url: trimmedUrl,
        source: "manual",
      },
    };
  }

  // Google Maps
  if (
    on("maps.google.com") ||
    (on("google.com", "goo.gl") && web?.pathname.startsWith("/maps"))
  ) {
    const coordsMatch = trimmedUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const queryMatch = trimmedUrl.match(/[?&]q=([^&]+)/);

    let location = "";
    if (coordsMatch) {
      location = `${coordsMatch[1]},${coordsMatch[2]}`;
    } else if (queryMatch) {
      location = decodeURIComponent(queryMatch[1]);
    } else {
      location = trimmedUrl;
    }

    return {
      type: "maps",
      config: { type: "maps", location },
    };
  }

  // Bitcoin
  if (trimmedUrl.startsWith("bitcoin:")) {
    const addressMatch = trimmedUrl.match(/bitcoin:([^?]+)/);
    const amountMatch = trimmedUrl.match(/[?&]amount=([^&]+)/);
    const labelMatch = trimmedUrl.match(/[?&]label=([^&]+)/);
    const messageMatch = trimmedUrl.match(/[?&]message=([^&]+)/);

    return {
      type: "bitcoin",
      config: {
        type: "bitcoin",
        address: addressMatch?.[1] || "",
        amount: amountMatch?.[1] || "",
        label: labelMatch ? decodeURIComponent(labelMatch[1]) : "",
        message: messageMatch ? decodeURIComponent(messageMatch[1]) : "",
      },
    };
  }

  // Ethereum
  if (trimmedUrl.startsWith("ethereum:")) {
    const addressMatch = trimmedUrl.match(/ethereum:([^?]+)/);
    const amountMatch = trimmedUrl.match(/[?&]value=([^&]+)/);
    const gasMatch = trimmedUrl.match(/[?&]gas=([^&]+)/);

    return {
      type: "ethereum",
      config: {
        type: "ethereum",
        address: addressMatch?.[1] || "",
        amount: amountMatch?.[1] || "",
        gas: gasMatch?.[1] || "",
      },
    };
  }

  // WhatsApp
  if (on("wa.me")) {
    const phoneMatch = web?.pathname.match(/^\/(\d+)/);
    const messageMatch = trimmedUrl.match(/[?&]text=([^&]+)/);

    if (phoneMatch?.[1]) {
      return {
        type: "whatsapp",
        config: {
          type: "whatsapp",
          phoneNumber: `+${phoneMatch[1]}`,
          message: messageMatch ? decodeURIComponent(messageMatch[1]) : "",
        },
      };
    }
  }

  // Email (mailto:)
  if (trimmedUrl.startsWith("mailto:")) {
    const emailMatch = trimmedUrl.match(/mailto:([^?]+)/);
    const subjectMatch = trimmedUrl.match(/[?&]subject=([^&]+)/);
    const bodyMatch = trimmedUrl.match(/[?&]body=([^&]+)/);

    return {
      type: "email",
      config: {
        type: "email",
        recipient: emailMatch?.[1] || "",
        subject: subjectMatch ? decodeURIComponent(subjectMatch[1]) : "",
        body: bodyMatch ? decodeURIComponent(bodyMatch[1]) : "",
      },
    };
  }

  // Phone (tel:)
  if (trimmedUrl.startsWith("tel:")) {
    const phoneMatch = trimmedUrl.match(/tel:([+\d]+)/);
    return {
      type: "phone",
      config: {
        type: "phone",
        phoneNumber: phoneMatch?.[1] || "",
      },
    };
  }

  // SMS
  if (trimmedUrl.startsWith("sms:") || trimmedUrl.startsWith("SMSTO:")) {
    const phoneMatch = trimmedUrl.match(/(?:sms:|SMSTO:)([^:?]+)/);
    const messageMatch = trimmedUrl.match(/[?:](.+)$/);

    return {
      type: "sms",
      config: {
        type: "sms",
        phoneNumber: phoneMatch?.[1] || "",
        message: messageMatch?.[1] || "",
      },
    };
  }

  // UPI
  if (trimmedUrl.startsWith("upi://pay")) {
    const upiIdMatch = trimmedUrl.match(/[?&]pa=([^&]+)/);
    const nameMatch = trimmedUrl.match(/[?&]pn=([^&]+)/);
    const amountMatch = trimmedUrl.match(/[?&]am=([^&]+)/);
    const noteMatch = trimmedUrl.match(/[?&]tn=([^&]+)/);

    return {
      type: "upi",
      config: {
        type: "upi",
        upiId: upiIdMatch ? decodeURIComponent(upiIdMatch[1]) : "",
        name: nameMatch ? decodeURIComponent(nameMatch[1]) : "",
        amount: amountMatch ? decodeURIComponent(amountMatch[1]) : "",
        note: noteMatch ? decodeURIComponent(noteMatch[1]) : "",
      },
    };
  }

  // If it's a valid URL but no specific type matched, return as URL
  if (isValidURL(trimmedUrl)) {
    return {
      type: "url",
      config: { type: "url", url: trimmedUrl },
    };
  }

  // If not a URL, treat as plain text
  return {
    type: "text",
    config: { type: "text", text: trimmedUrl },
  };
}

/**
 * Links that belong to the content types added on 2026-11-11 (Telegram,
 * Signal, Discord, LINE, Bluesky, Twitch, SoundCloud, Zoom, Google Meet,
 * Waze, Cash App, Revolut). Each form takes the pasted link as it is.
 */
function linkedContent(web: URL | null, raw: string): ParsedURL | null {
  if (!web) return null;
  const on = (...domains: string[]) => isOnDomain(web, ...domains);
  const path = web.pathname;
  const as = (config: QRContentConfig): ParsedURL => ({
    type: config.type,
    config,
  });

  if (on("t.me", "telegram.me", "telegram.dog") && path.length > 1) {
    return as({ type: "telegram", username: raw });
  }
  if (on("signal.me", "signal.group") && web.hash.length > 2) {
    return as({ type: "signal", link: raw });
  }
  if (
    (on("discord.gg") && path.length > 1) ||
    (on("discord.com", "discordapp.com") && path.startsWith("/invite/"))
  ) {
    return as({ type: "discord", invite: raw });
  }
  if (on("line.me", "lin.ee") && path.length > 1) {
    return as({ type: "line", username: raw });
  }
  if (on("bsky.app") && path.startsWith("/profile/")) {
    return as({ type: "bluesky", handle: raw });
  }
  if (on("twitch.tv") && /^\/[A-Za-z0-9_]{4,25}\/?$/.test(path)) {
    return as({ type: "twitch", username: raw });
  }
  if (on("soundcloud.com", "snd.sc") && path.length > 1) {
    return as({ type: "soundcloud", username: raw });
  }
  if (
    on("zoom.us", "zoom.com", "zoomgov.com") &&
    /^\/(?:j|w|s|my)\/[^/]+/.test(path)
  ) {
    return as({ type: "zoom", meeting: raw });
  }
  if (
    on("meet.google.com") &&
    /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(path)
  ) {
    return as({ type: "google-meet", meeting: raw });
  }
  if (on("waze.com") && path.startsWith("/ul")) {
    const point = web.searchParams.get("ll");
    const query = web.searchParams.get("q");
    const location = point ? point.replace(",", ", ") : query;
    if (location) {
      return as({
        type: "waze",
        location,
        navigate: web.searchParams.get("navigate") === "yes",
      });
    }
  }
  if (on("cash.app") && path.startsWith("/$")) {
    return as({ type: "cashapp", username: raw });
  }
  if (on("revolut.me") && path.length > 1) {
    return as({ type: "revolut", username: raw });
  }
  return null;
}

/**
 * Check if a string is a valid URL
 */
function isValidURL(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Extract phone number with country code
 */
export function extractPhoneNumber(text: string): string | null {
  // Match international format: +1234567890 or +1 (234) 567-8900
  const phoneMatch = text.match(/\+?\d[\d\s()-]{7,}/);
  return phoneMatch ? phoneMatch[0] : null;
}

/**
 * Extract email address
 */
export function extractEmail(text: string): string | null {
  const emailMatch = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );
  return emailMatch ? emailMatch[0] : null;
}
