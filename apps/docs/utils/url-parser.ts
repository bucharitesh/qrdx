/**
 * URL Parser Utility
 * Detects content type from pasted URLs and extracts relevant values
 */

import type { ContentType, QRContentConfig } from "@/types/qr-content";

interface ParsedURL {
  type: ContentType;
  config: Partial<QRContentConfig>;
}

/**
 * Parse a URL and detect its content type with extracted values
 */
export function parseURL(url: string): ParsedURL | null {
  const trimmedUrl = url.trim();

  // Instagram
  if (
    trimmedUrl.includes("instagram.com") ||
    trimmedUrl.includes("instagr.am")
  ) {
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
  if (trimmedUrl.includes("facebook.com") || trimmedUrl.includes("fb.com")) {
    return {
      type: "facebook",
      config: { type: "facebook", profileUrl: trimmedUrl },
    };
  }

  // Twitter/X
  if (
    trimmedUrl.includes("twitter.com") ||
    trimmedUrl.includes("x.com") ||
    trimmedUrl.match(/^@\w+$/)
  ) {
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
  if (trimmedUrl.includes("linkedin.com")) {
    return {
      type: "linkedin",
      config: { type: "linkedin", profileUrl: trimmedUrl },
    };
  }

  // TikTok
  if (trimmedUrl.includes("tiktok.com")) {
    const usernameMatch = trimmedUrl.match(/tiktok\.com\/@([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "tiktok",
        config: { type: "tiktok", username: `@${usernameMatch[1]}` },
      };
    }
  }

  // YouTube
  if (trimmedUrl.includes("youtube.com") || trimmedUrl.includes("youtu.be")) {
    // Check if it's a video or channel
    if (
      trimmedUrl.includes("/watch") ||
      trimmedUrl.includes("youtu.be/") ||
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
  if (trimmedUrl.includes("reddit.com")) {
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
  if (trimmedUrl.includes("pinterest.com")) {
    const usernameMatch = trimmedUrl.match(/pinterest\.com\/([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "pinterest",
        config: { type: "pinterest", username: usernameMatch[1] },
      };
    }
  }

  // Snapchat
  if (trimmedUrl.includes("snapchat.com")) {
    const usernameMatch = trimmedUrl.match(/snapchat\.com\/add\/([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "snapchat",
        config: { type: "snapchat", username: usernameMatch[1] },
      };
    }
  }

  // Threads
  if (trimmedUrl.includes("threads.net")) {
    const usernameMatch = trimmedUrl.match(/threads\.net\/@([^/?]+)/);
    if (usernameMatch?.[1]) {
      return {
        type: "threads",
        config: { type: "threads", username: `@${usernameMatch[1]}` },
      };
    }
  }

  // Spotify
  if (trimmedUrl.includes("spotify.com") || trimmedUrl.startsWith("spotify:")) {
    return {
      type: "spotify",
      config: { type: "spotify", uri: trimmedUrl },
    };
  }

  // Venmo
  if (trimmedUrl.includes("venmo.com")) {
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
  if (trimmedUrl.includes("paypal.com") || trimmedUrl.includes("paypal.me")) {
    return {
      type: "paypal",
      config: { type: "paypal", paypalUrl: trimmedUrl },
    };
  }

  // Amazon
  if (trimmedUrl.includes("amazon.")) {
    return {
      type: "amazon",
      config: { type: "amazon", productUrl: trimmedUrl },
    };
  }

  // Flipkart
  if (trimmedUrl.includes("flipkart.com")) {
    return {
      type: "flipkart",
      config: { type: "flipkart", productUrl: trimmedUrl },
    };
  }

  // Etsy
  if (trimmedUrl.includes("etsy.com")) {
    return {
      type: "etsy",
      config: { type: "etsy", shopUrl: trimmedUrl },
    };
  }

  // Cal.com
  if (trimmedUrl.includes("cal.com")) {
    return {
      type: "calcom",
      config: { type: "calcom", bookingUrl: trimmedUrl },
    };
  }

  // Dub.sh
  if (trimmedUrl.includes("dub.sh") || trimmedUrl.includes("dub.co")) {
    return {
      type: "dubsh",
      config: { type: "dubsh", shortUrl: trimmedUrl },
    };
  }

  // Google Forms (Attendance)
  if (
    trimmedUrl.includes("docs.google.com/forms") ||
    trimmedUrl.includes("forms.gle")
  ) {
    return {
      type: "attendance",
      config: { type: "attendance", formUrl: trimmedUrl },
    };
  }

  // Google Maps
  if (
    trimmedUrl.includes("google.com/maps") ||
    trimmedUrl.includes("maps.google.com") ||
    trimmedUrl.includes("goo.gl/maps")
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
  if (trimmedUrl.includes("wa.me") || trimmedUrl.includes("whatsapp.com")) {
    const phoneMatch = trimmedUrl.match(/wa\.me\/(\d+)/);
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
