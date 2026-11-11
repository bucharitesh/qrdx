import { getFrameLayout, isFrameActive, OFFICIAL_FRAMES } from "qrdx";
import type {
  ColorConfig,
  QRArtImage,
  QRArtMode,
  QRArtVariant,
  QRProps,
} from "qrdx/types";
import { OFFICIAL_FRAME_RESOLVER } from "@/lib/community/catalog";
import { itemPath } from "@/lib/community/types";
import { demoPath } from "@/lib/landing/demo-paths";
import { generatorPath } from "@/lib/landing/generator-paths";
import {
  BODY_CATALOG,
  EYE_CATALOG,
  FRAME_CATALOG,
} from "@/lib/pattern-catalog";
import {
  type ArtLinkMode,
  type PlaygroundLinkOptions,
  playgroundHref,
} from "@/lib/playground-links";
import { playgroundDesignHref } from "@/lib/playground-style";
import { getQrType } from "@/lib/qr-types-content";
import { CATEGORY_LABELS } from "@/lib/themes/categories";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";
import { encodeQRContent } from "@/utils/qr-content-encoder";
import { defaultPresets } from "@/utils/qr-presets";

/**
 * The "Made with QRdx" walls (components/showcase/): every tile is a real
 * code QRdx draws. Each image is drawn by the engine at build time
 * (app/gallery/[file]/route.ts) and tests/home/gallery-scan*.test.ts decode
 * every one, so nothing that doesn't scan can ship.
 *
 * Tiles come in four bands: every built-in theme, the official frames, art
 * and logos (with the border templates and the transparent and print-ready
 * codes), and every content type and hosted page. The home page shows a
 * curated selection (lib/landing/showcase-wall.ts); /community shows them
 * all.
 *
 * Sample values are obviously samples: qrdx.dev pages, example.com
 * addresses, a 555-01xx phone number (reserved for fiction), each
 * platform's own account, placeholders such as "yourname", and payment
 * addresses nobody owns. SAMPLE_HOSTS lists every host a tile may point at.
 */

export type WallBand = "themes" | "frames" | "art" | "content";

/** Tile proportions: a justified row gives every tile in it one height. */
export type TileShape = "wide" | "square" | "tall";

export const TILE_ASPECT: Record<TileShape, number> = {
  wide: 1.6,
  square: 1,
  tall: 0.75,
};

/** Width the codes are drawn at, before any frame. */
export const GALLERY_CODE_SIZE = 240;

/** A sample from public/images/art-samples, sampled as the editor does. */
export type GalleryArtSample = "bloom" | "wave" | "dog" | "portrait";

/** A center logo: the QRdx mark (the editor's default) or a sample logo. */
export type GalleryLogo = "qrdx" | "cafe";

export interface WallTile {
  /** Slug for the image URL: /gallery/<id>.svg */
  id: string;
  band: WallBand;
  /** Chip text, first part, e.g. "Wi-Fi". */
  label: string;
  /** Chip text, second part, e.g. "Guest Wi-Fi theme". */
  detail: string;
  /** What the image shows, for screen readers and image search. */
  alt: string;
  /** What the code holds; scanning it gives exactly this. */
  value: string;
  /** Built-in theme the code is drawn in (a key of defaultPresets). */
  preset: string;
  /** Changes on top of the theme (an official frame, a template, an eye). */
  style?: Partial<ThemeStyles>;
  /**
   * Where the tile goes: the playground with the tile's look (and its
   * content type, with QRdx's sample), or a hosted page's live demo.
   */
  href: string;
  /**
   * The page about what the tile shows (its type's generator page, its
   * frame's page, a guide): a second, crawlable link on the tile's name,
   * beside the code's own link.
   */
  about?: { href: string; label: string };
  /** Theme tiles: the link opens this theme in the playground. */
  appliesPreset?: boolean;
  /** The shape the tile takes when a layout doesn't choose one. */
  shape: TileShape;
  /** Content type the value is (content tiles). */
  contentType?: ContentType;
  /** Hosted page type the value opens (content tiles). */
  pageType?: string;
  /** Official frame id (frame tiles). */
  officialFrame?: string;
  /** Center logo (theme logos come from `showLogo`). */
  logo?: GalleryLogo;
  /** Logo QR or Image QR (vector art, no AI). */
  art?: {
    mode: QRArtMode;
    variant: QRArtVariant;
    intensity: number;
    sample: GalleryArtSample;
  };
  /** No background paint; the tile shows a checkerboard behind it. */
  transparent?: boolean;
  /** The tile draws crop marks around the code, as the print PDF has. */
  print?: boolean;
  /**
   * An option the scan score marks down that the wall still shows, so the
   * community wall covers everything the editor offers. Such tiles must
   * decode crisp and through the camera model instead; this says why.
   */
  caution?: string;
}

const SITE = "https://qrdx.dev";
/** 555-0100 to 555-0199 are reserved for fictional use in North America. */
const SAMPLE_PHONE = "+1 415 555 0132";
const SAMPLE_GREETING = "Hello from QRdx";

/**
 * Hosts a tile's value may point at: QRdx, example.com, and the platform a
 * content type is for (its own account or an obvious placeholder handle).
 */
export const SAMPLE_HOSTS = [
  "qrdx.dev",
  "wa.me",
  "www.google.com",
  "search.google.com",
  "www.facebook.com",
  "www.instagram.com",
  "www.reddit.com",
  "www.tiktok.com",
  "twitter.com",
  "www.linkedin.com",
  "www.youtube.com",
  "www.pinterest.com",
  "www.snapchat.com",
  "www.threads.net",
  "open.spotify.com",
  "paypal.me",
  "venmo.com",
  "www.etsy.com",
  "dub.sh",
  "drive.google.com",
  "www.amazon.com",
  "www.flipkart.com",
  "cal.com",
  // Content types added 2026-11-11
  "t.me",
  "signal.me",
  "discord.gg",
  "line.me",
  "bsky.app",
  "mastodon.social",
  "www.twitch.tv",
  "soundcloud.com",
  "zoom.us",
  "meet.google.com",
  "waze.com",
  "cash.app",
  "revolut.me",
] as const;

const encode = (content: QRContentConfig) => encodeQRContent(content);
const page = (type: string, id: string) => `${SITE}${demoPath(type, id)}`;
const themeName = (id: string) => defaultPresets[id]?.label ?? id;
const kebab = (id: string) =>
  id.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** The Art tab's link mode for each art mode. */
const ART_LINK_MODE = {
  logo: "logo",
  halftone: "image",
} as const satisfies Record<QRArtMode, ArtLinkMode>;

/**
 * Where a tile goes: the playground with the tile's own look (its theme, or
 * the theme with the tile's changes as a `style`) and whatever else the
 * tile asks for (its content type with QRdx's sample, a tab, a dialog).
 * Logos and art images can't travel in a link; the tile opens where they
 * are added.
 */
function tileHref(
  look: { preset: string; style?: Partial<ThemeStyles> },
  options: Omit<PlaygroundLinkOptions, "preset" | "style" | "themeId"> = {},
): string {
  const preset = defaultPresets[look.preset];
  if (!preset) throw new Error(`Unknown wall theme "${look.preset}"`);
  return playgroundDesignHref({
    ...options,
    preset: look.preset,
    design: look.style ? { ...preset.styles, ...look.style } : undefined,
    officialFrames: OFFICIAL_FRAME_RESOLVER,
  });
}

const BODY_LABELS = new Map(BODY_CATALOG.map((b) => [b.value, b.label]));
const EYE_LABELS = new Map(EYE_CATALOG.map((e) => [e.value, e.label]));
const FRAME_LABELS = new Map(FRAME_CATALOG.map((f) => [f.value, f.label]));

/** A theme's look in words, for alt text: "liquid modules, squircle eyes". */
function describeLook(styles: ThemeStyles): string {
  const body = BODY_LABELS.get(styles.bodyPattern ?? "circle") ?? "dot";
  const eye = EYE_LABELS.get(styles.cornerEyePattern ?? "gear") ?? "square";
  const parts = [`${body.toLowerCase()} modules`, `${eye.toLowerCase()} eyes`];
  const { frame } = styles;
  if (frame && isFrameActive(frame) && frame.style !== "custom") {
    const name = FRAME_LABELS.get(frame.style)?.toLowerCase() ?? "frame";
    parts.push(
      frame.text
        ? `a ${name} frame that says ${frame.text}`
        : `a ${name} frame`,
    );
  }
  if (styles.templateId) parts.push("a border");
  if (styles.showLogo) parts.push("the QRdx logo in the center");
  return parts.join(", ");
}

/** The shape a code takes by default: frames and borders stand tall. */
function naturalShape(styles: ThemeStyles): TileShape {
  const { frame, bgColor } = styles;
  if (!(frame && isFrameActive(frame))) return "square";
  const { width, height } = getFrameLayout(GALLERY_CODE_SIZE, frame, bgColor);
  const ratio = height / width;
  if (ratio > 1.1) return "tall";
  return ratio < 0.8 ? "wide" : "square";
}

// ── Themes: every built-in theme, opening it in the playground ────────────

/**
 * Built-in themes the scan score marks down that the wall still shows, as
 * it shows every theme (tests/themes/presets-gate.test.ts names them too).
 */
const THEME_CAUTIONS: Record<string, string> = {
  halloweenPumpkin:
    "A light-on-dark seasonal theme: some scanner apps can't read light codes on dark, so the scan score marks it down.",
};

const themeTiles: WallTile[] = Object.entries(defaultPresets).map(
  ([id, preset]) => {
    const label = preset.label ?? id;
    const category = preset.category ?? "brand";
    return {
      id: `theme-${kebab(id)}`,
      band: "themes",
      label,
      detail: `${CATEGORY_LABELS[category]} theme`,
      alt: `QR code in the ${label} theme: ${describeLook(preset.styles)}`,
      // Scanning a theme tile opens that theme, as clicking it does.
      value: `${SITE}${playgroundHref({ preset: id })}`,
      ...(THEME_CAUTIONS[id] && { caution: THEME_CAUTIONS[id] }),
      preset: id,
      href: playgroundHref({ preset: id }),
      appliesPreset: true,
      shape: naturalShape(preset.styles),
    };
  },
);

// ── Frames: QRdx's official frame specs, on the classic code ─────────────

/**
 * What each official frame's code holds: something its prompt fits. A
 * string is a hosted page's address (a URL code); a config is a static
 * content type, which the tile's playground link opens.
 */
const FRAME_CONTENT: Record<string, QRContentConfig | string> = {
  "wifi-card": {
    type: "wifi",
    ssid: "QRdx Sample",
    password: "sample-only",
    encryption: "WPA",
  },
  "save-contact": {
    type: "vcard",
    firstName: "Sam",
    lastName: "Sample",
    email: "sam@example.com",
  },
  "order-at-table": page("menu", "restaurant"),
  "table-tent": page("menu", "cafe"),
  "event-ticket": page("event", "conference"),
  "rsvp-card": page("event", "wedding"),
  "feedback-bubble": page("feedback", "guest-feedback"),
  "check-in": page("feedback", "sign-up"),
  attendance: page("feedback", "sign-up"),
  "get-the-app": page("apps", "app-launch"),
  "audio-guide": page("mp3", "podcast"),
  "shop-window": page("business", "local-shop"),
  "sign-rider": page("vcard", "realtor"),
  "product-info": page("pdf", "brochure"),
  "review-us": {
    type: "google-review",
    // Google's documented sample place ID.
    placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
  },
  "scan-to-pay": {
    type: "upi",
    upiId: "sample@example",
    name: "QRdx Sample",
  },
  "follow-us": { type: "instagram", username: "instagram" },
  donate: { type: "paypal", paypalUrl: "https://paypal.me/yourname" },
  "book-now": {
    type: "calcom",
    bookingUrl: "https://cal.com/yourname/30min",
  },
};

const OFFICIAL_BY_ID = new Map(
  OFFICIAL_FRAMES.map((frame) => [frame.id, frame]),
);

/**
 * The official frames on the wall: the first 24 the catalogue had. The
 * whole library (hundreds, with every holiday) lives at /community/frames,
 * which the wall's frames band links to.
 */
export const WALL_FRAME_IDS: readonly string[] = [
  "wifi-card",
  "table-tent",
  "order-at-table",
  "review-us",
  "scan-to-pay",
  "event-ticket",
  "rsvp-card",
  "save-contact",
  "follow-us",
  "get-the-app",
  "feedback-bubble",
  "product-info",
  "register-product",
  "donate",
  "check-in",
  "audio-guide",
  "sign-rider",
  "book-now",
  "shop-window",
  "attendance",
  "winter",
  "halloween",
  "christmas",
  "new-year",
];

const frameTiles: WallTile[] = WALL_FRAME_IDS.map((id) => {
  const frame = OFFICIAL_BY_ID.get(id);
  if (!frame) throw new Error(`Unknown official frame "${id}"`);
  const style: Partial<ThemeStyles> = {
    frame: { style: "custom", spec: frame.spec },
  };
  const content = FRAME_CONTENT[frame.id] ?? SITE;
  const type: ContentType = typeof content === "string" ? "url" : content.type;
  return {
    id: `frame-${frame.id}`,
    band: "frames",
    label: frame.name,
    detail: "Official frame",
    alt: `QR code in the ${frame.name} frame: ${frame.description}`,
    value: typeof content === "string" ? content : encode(content),
    preset: "classic",
    style,
    // The frame on the classic code, for the content type its prompt fits.
    href: tileHref({ preset: "classic", style }, { type, sample: true }),
    about: { href: itemPath("frame", frame.id), label: "frame" },
    officialFrame: frame.id,
    shape: naturalShape({ ...defaultPresets.classic?.styles, ...style }),
  };
});

// ── Art, logos, borders and output options ───────────────────────────────

const ART_SAMPLES: Record<GalleryArtSample, string> = {
  bloom: "a pink flower logo",
  wave: "a blue wave logo",
  dog: "a photo of a dog",
  portrait: "a black-and-white portrait",
};

const art = (
  sample: GalleryArtSample,
  mode: QRArtMode,
  variant: QRArtVariant,
  preset: string,
): WallTile => {
  const logo = mode === "logo";
  const name = logo ? "Logo QR" : "Image QR";
  const look = {
    blend: "blended in",
    badge: "as a badge",
    color: "in color",
    mono: "in one ink",
  }[variant];
  return {
    id: `art-${mode}-${variant}-${sample}`,
    band: "art",
    label: name,
    detail: `${variant[0]?.toUpperCase()}${variant.slice(1)}, ${themeName(preset)} theme`,
    alt: `${name} code showing ${ART_SAMPLES[sample]} ${look}`,
    value: SITE,
    preset,
    // The tile's theme, on the Art tab in its mode (the image is added there).
    href: tileHref({ preset }, { art: ART_LINK_MODE[mode] }),
    art: { mode, variant, intensity: 0.7, sample },
    shape: "square",
  };
};

/** The border templates that score Great are themes; these show the rest. */
const border = (
  templateId: string,
  label: string,
  caution?: string,
): WallTile => {
  const style: Partial<ThemeStyles> = {
    templateId,
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
  };
  return {
    id: `border-${kebab(templateId)}`,
    band: "art",
    label: `${label} border`,
    detail: "Border template",
    alt: `QR code inside the ${label} border template`,
    value: SITE,
    preset: "minimal",
    style,
    href: tileHref({ preset: "minimal", style }),
    shape: "square",
    ...(caution && { caution }),
  };
};

/** The Design tab's Logo section, where center logos are added. */
const LOGO_SECTION = { tab: "customisations", section: "logo" } as const;
const QRDX_LOGO: Partial<ThemeStyles> = { showLogo: true };
const CIRCLE_EYES: Partial<ThemeStyles> = {
  cornerEyePattern: "circle",
  cornerEyeDotPattern: "circle",
};

const SMALL_IN_BORDER =
  "The border draws the code at under half the artwork's width, so the scan score marks it down; print it at 5 cm or more.";

const artTiles: WallTile[] = [
  art("bloom", "logo", "blend", "classic"),
  art("wave", "logo", "badge", "minimal"),
  art("wave", "logo", "blend", "folio"),
  art("bloom", "logo", "badge", "fog"),
  art("dog", "halftone", "color", "slate"),
  art("portrait", "halftone", "mono", "monochrome"),
  art("portrait", "halftone", "color", "classic"),
  art("dog", "halftone", "mono", "minimal"),
  {
    id: "logo-cafe",
    band: "art",
    label: "Logo",
    detail: "Any image in the center",
    alt: "QR code with a coffee cup logo in the center",
    value: page("menu", "cafe"),
    preset: "caffeine",
    logo: "cafe",
    // An uploaded logo can't travel: the theme, at the Logo section.
    href: tileHref({ preset: "caffeine" }, LOGO_SECTION),
    shape: "square",
  },
  {
    id: "logo-qrdx",
    band: "art",
    label: "QRdx logo",
    detail: "The editor's default logo",
    alt: "QR code with the QRdx logo in the center",
    value: `${SITE}/docs/help/designing/logos`,
    preset: "modern",
    style: QRDX_LOGO,
    logo: "qrdx",
    // The QRdx mark travels in a link (showLogo); uploaded logos don't.
    href: tileHref({ preset: "modern", style: QRDX_LOGO }, LOGO_SECTION),
    shape: "square",
  },
  {
    id: "transparent",
    band: "art",
    label: "Transparent",
    detail: "No background color",
    alt: "QR code with a transparent background",
    value: SITE,
    preset: "gilt",
    transparent: true,
    // Transparency is a download option: the theme, with the download dialog.
    href: tileHref({ preset: "gilt" }, { open: "download" }),
    about: { href: "/docs/features/downloads", label: "downloads guide" },
    shape: "square",
  },
  {
    id: "print",
    band: "art",
    label: "Print-ready",
    detail: "CMYK PDF and EPS",
    alt: "QR code inside printer's crop marks",
    value: SITE,
    preset: "folio",
    print: true,
    href: tileHref({ preset: "folio" }, { open: "print" }),
    about: {
      href: "/docs/help/getting-started/download-and-print",
      label: "download and print guide",
    },
    shape: "square",
  },
  border("StandardBox", "Standard box", SMALL_IN_BORDER),
  border("StrikedBox", "Striked box"),
  border("Arrow", "Arrow", SMALL_IN_BORDER),
  border("Halloween", "Halloween", SMALL_IN_BORDER),
  {
    id: "eyes-circle",
    band: "art",
    label: "Circle eyes",
    detail: "Bubbles theme with round eyes",
    alt: "QR code with round corner eyes",
    value: SITE,
    preset: "bubbles",
    style: CIRCLE_EYES,
    href: tileHref({ preset: "bubbles", style: CIRCLE_EYES }),
    shape: "square",
    caution:
      "Round eyes read in most camera apps but not in strict scanners, so the scan score marks them down.",
  },
];

// ── Content types and hosted pages ───────────────────────────────────────

interface Look {
  preset: string;
  /** An official frame on the classic code instead of a theme. */
  frame?: string;
  shape?: TileShape;
}

interface ContentSpec extends Look {
  label?: string;
  config: QRContentConfig;
}

/** Each content type with a sample value and a look that suits it. */
const CONTENT: Record<ContentType, ContentSpec> = {
  url: {
    label: "Website",
    config: { type: "url", url: `${SITE}/playground` },
    preset: "orchid",
  },
  text: {
    label: "Text",
    config: { type: "text", text: SAMPLE_GREETING },
    preset: "loveNote",
  },
  email: {
    config: {
      type: "email",
      recipient: "hello@example.com",
      subject: SAMPLE_GREETING,
    },
    preset: "periwinkle",
  },
  phone: {
    label: "Phone",
    config: { type: "phone", phoneNumber: SAMPLE_PHONE },
    preset: "helpDesk",
  },
  sms: {
    config: {
      type: "sms",
      phoneNumber: SAMPLE_PHONE,
      message: SAMPLE_GREETING,
    },
    preset: "bubblegum",
  },
  whatsapp: {
    config: {
      type: "whatsapp",
      phoneNumber: SAMPLE_PHONE,
      message: SAMPLE_GREETING,
    },
    preset: "message",
  },
  wifi: {
    config: {
      type: "wifi",
      ssid: "QRdx Sample",
      password: "sample-only",
      encryption: "WPA",
    },
    preset: "guestWifi",
  },
  vcard: {
    label: "Contact",
    config: {
      type: "vcard",
      firstName: "Sam",
      lastName: "Sample",
      // Name and email only: each extra field makes the code denser.
      email: "sam@example.com",
    },
    preset: "businessCard",
  },
  maps: {
    label: "Maps",
    config: { type: "maps", location: "Eiffel Tower, Paris" },
    preset: "nature",
    shape: "wide",
  },
  facebook: {
    config: {
      type: "facebook",
      profileUrl: "https://www.facebook.com/facebook",
    },
    preset: "cobalt",
  },
  instagram: {
    config: { type: "instagram", username: "instagram" },
    preset: "instagram",
  },
  reddit: {
    config: { type: "reddit", subreddit: "reddit" },
    preset: "blaze",
  },
  tiktok: { config: { type: "tiktok", username: "tiktok" }, preset: "acid" },
  twitter: {
    label: "X",
    config: { type: "twitter", username: "X" },
    preset: "ink",
  },
  linkedin: {
    config: {
      type: "linkedin",
      profileUrl: "https://www.linkedin.com/company/linkedin",
    },
    preset: "harbor",
    shape: "wide",
  },
  youtube: {
    config: { type: "youtube", channelUrl: "@YouTube" },
    preset: "retro",
  },
  pinterest: {
    config: { type: "pinterest", username: "pinterest" },
    preset: "rose",
  },
  snapchat: {
    config: { type: "snapchat", username: "teamsnapchat" },
    preset: "butter",
  },
  threads: {
    config: { type: "threads", username: "threads" },
    preset: "monochrome",
  },
  spotify: {
    config: {
      type: "spotify",
      // Spotify's own Today's Top Hits playlist.
      uri: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    },
    preset: "pistachio",
    shape: "wide",
  },
  upi: {
    label: "UPI",
    config: { type: "upi", upiId: "sample@example", name: "QRdx Sample" },
    preset: "classic",
    frame: "scan-to-pay",
  },
  paypal: {
    config: { type: "paypal", paypalUrl: "https://paypal.me/yourname" },
    preset: "ultramarine",
  },
  "google-review": {
    label: "Google review",
    // Google's documented sample place ID.
    config: { type: "google-review", placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" },
    preset: "moss",
  },
  venmo: {
    config: { type: "venmo", username: "your-name" },
    preset: "aurora",
  },
  bitcoin: {
    // A provably unspendable address: obviously not anyone's wallet.
    config: { type: "bitcoin", address: "1BitcoinEaterAddressDontSendf59kuE" },
    preset: "amberMinimal",
  },
  ethereum: {
    // The conventional burn address.
    config: {
      type: "ethereum",
      address: "0x000000000000000000000000000000000000dEaD",
    },
    preset: "onyx",
  },
  etsy: {
    config: { type: "etsy", shopUrl: "YourShopName" },
    preset: "terracotta",
    shape: "wide",
  },
  dubsh: {
    label: "Dub link",
    config: { type: "dubsh", shortUrl: "https://dub.sh/qrdx" },
    preset: "twinkle",
  },
  "google-drive": {
    config: {
      type: "google-drive",
      url: "https://drive.google.com/file/d/sample-file-id/view",
    },
    preset: "classic",
    frame: "product-info",
  },
  attendance: {
    config: { type: "attendance", formUrl: page("feedback", "sign-up") },
    preset: "classic",
    frame: "attendance",
  },
  amazon: {
    config: {
      type: "amazon",
      productUrl: "https://www.amazon.com/dp/B08N5WRWNW",
    },
    preset: "clay",
  },
  flipkart: {
    config: { type: "flipkart", productUrl: "https://www.flipkart.com/" },
    preset: "pinwheel",
  },
  calcom: {
    label: "Cal.com",
    config: { type: "calcom", bookingUrl: "https://cal.com/yourname/30min" },
    preset: "seafoam",
  },
  // ── Content types added 2026-11-11 ──
  // Bank codes use each standard's documentation sample or all-zero IDs;
  // crypto addresses fail their checksums, so wallets refuse them.
  pix: {
    // A phone key with area code 00, which no phone has, and "Fulano", the
    // Portuguese placeholder name.
    config: {
      type: "pix",
      pixKey: "+5500000000000",
      name: "Fulano",
      city: "Brasilia",
    },
    preset: "retro",
  },
  sepa: {
    label: "SEPA transfer",
    config: {
      type: "sepa",
      name: "QRdx Sample",
      iban: "DE58123456780123456789",
      remittance: "Sample payment",
    },
    preset: "cobalt",
  },
  paynow: {
    config: { type: "paynow", proxyType: "uen", proxy: "T00XX0000X" },
    preset: "classic",
  },
  promptpay: {
    config: { type: "promptpay", proxyType: "id", proxy: "0000000000000" },
    preset: "glacier",
  },
  vietqr: {
    config: {
      type: "vietqr",
      bankBin: "970436",
      accountType: "account",
      accountNumber: "0000000000",
    },
    preset: "blaze",
  },
  cashapp: {
    label: "Cash App",
    config: { type: "cashapp", username: "$yourcashtag" },
    preset: "emerald",
  },
  revolut: {
    config: { type: "revolut", username: "yourname" },
    preset: "graphite",
  },
  telegram: {
    // Telegram's own channel.
    config: { type: "telegram", username: "telegram" },
    preset: "gradientOcean",
  },
  signal: {
    config: { type: "signal", phoneNumber: "+1 415 555 0147" },
    preset: "signal",
  },
  discord: {
    config: { type: "discord", invite: "yourserver" },
    preset: "royal",
  },
  line: {
    label: "LINE",
    config: { type: "line", username: "yourname" },
    preset: "fern",
  },
  bluesky: {
    // Bluesky's own account.
    config: { type: "bluesky", handle: "bsky.app" },
    preset: "periwinkle",
    shape: "wide",
  },
  mastodon: {
    // Mastodon's own account.
    config: { type: "mastodon", handle: "@Mastodon@mastodon.social" },
    preset: "dusk",
  },
  twitch: {
    // Twitch's own channel.
    config: { type: "twitch", username: "twitch" },
    preset: "laser",
    shape: "tall",
  },
  soundcloud: {
    label: "SoundCloud",
    // SoundCloud's own profile.
    config: { type: "soundcloud", username: "soundcloud" },
    preset: "ember",
  },
  zoom: {
    config: { type: "zoom", meeting: "1234567890" },
    preset: "ice",
    shape: "wide",
  },
  "google-meet": {
    label: "Google Meet",
    // Google's documentation example code.
    config: { type: "google-meet", meeting: "abc-defg-hij" },
    preset: "slate",
  },
  waze: {
    config: { type: "waze", location: "48.8584, 2.2945" },
    preset: "taxi",
  },
  litecoin: {
    config: {
      type: "litecoin",
      address: "ltc1qexampleexampleexampleexampleexample0",
    },
    preset: "folio",
    shape: "wide",
  },
  dogecoin: {
    config: { type: "dogecoin", address: "DTestDemoWa11etTestDemoWa11etTestD" },
    preset: "butter",
  },
  bitcoincash: {
    label: "Bitcoin Cash",
    config: {
      type: "bitcoincash",
      address: "qexampleexampleexampleexampleexampleexampl",
    },
    preset: "jade",
  },
  solana: {
    config: {
      type: "solana",
      address: "DemoWa11etAddressForTheQRdxExamp1eDemo",
    },
    preset: "lavender",
  },
  monero: {
    config: {
      type: "monero",
      address:
        "4DemoWa11etAddressForTheQRdxExamp1eDemoWa11etAddressForTheQRdxExamp1eDemoWa11etAddressForTheQRd",
    },
    preset: "classic",
  },
};

/** Hosted pages, each opening its live demo on qrdx.dev. */
const PAGES: (Look & { type: string; variant: string; label: string })[] = [
  {
    type: "menu",
    variant: "cafe",
    label: "Menu page",
    preset: "restaurantMenu",
  },
  {
    type: "event",
    variant: "conference",
    label: "Event page",
    preset: "eventTicket",
  },
  {
    type: "coupon",
    variant: "store-discount",
    label: "Coupon page",
    preset: "retailSale",
  },
  {
    type: "links",
    variant: "creator",
    label: "Link in bio",
    preset: "gradientPurple",
  },
  {
    type: "vcard",
    variant: "realtor",
    label: "Contact page",
    preset: "realEstate",
  },
  {
    type: "business",
    variant: "florist",
    label: "Business page",
    preset: "blossom",
    shape: "wide",
  },
  {
    type: "feedback",
    variant: "guest-feedback",
    label: "Feedback form",
    preset: "classic",
    frame: "feedback-bubble",
  },
  { type: "pdf", variant: "brochure", label: "PDF page", preset: "gallery" },
  {
    type: "images",
    variant: "portfolio",
    label: "Image gallery",
    preset: "dusk",
  },
  {
    type: "video",
    variant: "product-video",
    label: "Video page",
    preset: "viewfinder",
  },
  {
    type: "mp3",
    variant: "podcast",
    label: "Audio page",
    preset: "classic",
    frame: "audio-guide",
  },
  { type: "apps", variant: "app-launch", label: "App page", preset: "hotline" },
  {
    type: "social",
    variant: "creator",
    label: "Social media page",
    preset: "instagram",
  },
  {
    type: "product",
    variant: "food",
    label: "Product page",
    preset: "terracotta",
    shape: "wide",
  },
  {
    type: "booking",
    variant: "salon",
    label: "Appointments page",
    preset: "rose",
  },
  {
    type: "payment",
    variant: "tip-jar",
    label: "Tip jar",
    preset: "ink",
  },
  {
    type: "real-estate",
    variant: "for-sale",
    label: "Property listing",
    preset: "realEstate",
  },
  { type: "pet", variant: "dog", label: "Pet ID tag", preset: "butter" },
  {
    type: "medical",
    variant: "emergency",
    label: "Medical ID",
    preset: "monochrome",
  },
  {
    type: "playlist",
    variant: "mixtape",
    label: "Playlist page",
    preset: "periwinkle",
  },
  {
    type: "custom",
    variant: "coming-soon",
    label: "Custom page",
    preset: "obsidian",
  },
];

const OFFICIAL = OFFICIAL_BY_ID;

/** A look's styles, detail text and alt description. */
function resolveLook(look: Look) {
  const preset = defaultPresets[look.preset];
  if (!preset) throw new Error(`Unknown wall theme "${look.preset}"`);
  const official = look.frame ? OFFICIAL.get(look.frame) : undefined;
  if (look.frame && !official) {
    throw new Error(`Unknown official frame "${look.frame}"`);
  }
  const style: Partial<ThemeStyles> | undefined = official && {
    frame: { style: "custom", spec: official.spec },
  };
  const styles = { ...preset.styles, ...style };
  return {
    style,
    styles,
    detail: official
      ? `${official.name} frame`
      : `${preset.label ?? look.preset} theme`,
    look: official
      ? `in the ${official.name} frame`
      : `in the ${preset.label ?? look.preset} theme`,
    officialFrame: official?.id,
  };
}

const contentTiles: WallTile[] = [
  ...(Object.entries(CONTENT) as [ContentType, ContentSpec][]).map(
    ([type, spec]) => {
      const { style, styles, detail, look, officialFrame } = resolveLook(spec);
      const label = spec.label ?? getQrType(type)?.name ?? type;
      return {
        id: `type-${type}`,
        band: "content" as const,
        label,
        detail,
        alt: `${label} QR code ${look}`,
        value: encode(spec.config),
        preset: spec.preset,
        ...(style && { style }),
        // The type in the tile's look, with QRdx's sample for the type.
        href: tileHref({ preset: spec.preset, style }, { type, sample: true }),
        about: { href: generatorPath(type), label: "QR code generator" },
        shape: spec.shape ?? naturalShape(styles),
        contentType: type,
        ...(officialFrame && { officialFrame }),
      };
    },
  ),
  ...PAGES.map((spec) => {
    const { style, styles, detail, look, officialFrame } = resolveLook(spec);
    return {
      id: `page-${spec.type}`,
      band: "content" as const,
      label: spec.label,
      detail,
      alt: `QR code for a hosted ${spec.label.toLowerCase()} ${look}`,
      value: page(spec.type, spec.variant),
      preset: spec.preset,
      ...(style && { style }),
      href: demoPath(spec.type, spec.variant),
      shape: spec.shape ?? naturalShape(styles),
      pageType: spec.type,
      ...(officialFrame && { officialFrame }),
    };
  }),
];

/** Every tile, in band order (the community wall shows them all). */
export const WALL_TILES: readonly WallTile[] = [
  ...themeTiles,
  ...frameTiles,
  ...artTiles,
  ...contentTiles,
];

const BY_ID = new Map(WALL_TILES.map((tile) => [tile.id, tile]));

export function getWallTile(id: string): WallTile | undefined {
  return BY_ID.get(id);
}

/** Image URL of a tile's code (app/gallery/[file]/route.ts). */
export const galleryImagePath = (tile: Pick<WallTile, "id">) =>
  `/gallery/${tile.id}.svg`;

/**
 * The checkerboard behind the transparent code: light in both color
 * schemes, so the code reads there as it would on paper (the scan test
 * decodes it on the darker square too).
 */
export const GALLERY_CHECKER = { light: "#ffffff", dark: "#e5e5e5" } as const;

/** The theme's styles with the tile's changes on top. */
export function tileStyles(tile: WallTile): ThemeStyles {
  const preset = defaultPresets[tile.preset];
  if (!preset) throw new Error(`Unknown wall theme "${tile.preset}"`);
  return { ...preset.styles, ...tile.style };
}

/** A tile image's URL and intrinsic size (frames make it larger). */
export function galleryImage(tile: WallTile): {
  src: string;
  width: number;
  height: number;
  framed: boolean;
} {
  const src = galleryImagePath(tile);
  const { frame, bgColor } = tileStyles(tile);
  if (!(frame && isFrameActive(frame))) {
    const size = GALLERY_CODE_SIZE;
    return { src, width: size, height: size, framed: false };
  }
  const layout = getFrameLayout(GALLERY_CODE_SIZE, frame, bgColor);
  return { src, width: layout.width, height: layout.height, framed: true };
}

const firstColor = (color: ColorConfig | undefined, fallback: string) => {
  if (!color) return fallback;
  if (typeof color === "string") return color;
  if (color.type === "solid") return color.color;
  if (color.type === "image") return color.underlay ?? fallback;
  return color.stops[0]?.color ?? fallback;
};

/**
 * The backdrop a tile's code sits on: the code's own background, carried
 * to the tile's edges like a seamless paper sweep, so a wide or tall tile
 * is the code in a field of its own color. Null for the transparent code,
 * which shows a checkerboard.
 */
export function tileBackdrop(tile: WallTile): string | null {
  if (tile.transparent) return null;
  return firstColor(tileStyles(tile).bgColor, "#ffffff");
}

/** Center logo width as a share of the code (the editor draws 256 of 1024). */
const LOGO_SCALE = 0.25;

export interface GalleryAssets {
  /** The center logo as a data URI (it must be inline: the SVG is an <img>). */
  logo?: string;
  /** The sampled art image, for Logo QR and Image QR. */
  artImage?: QRArtImage;
}

/** The logo a tile draws: its own, or the QRdx mark when its theme shows one. */
export function tileLogo(tile: WallTile): GalleryLogo | undefined {
  return tile.logo ?? (tileStyles(tile).showLogo ? "qrdx" : undefined);
}

/** Props for `<QRCodeSVG>` drawing a tile's code. */
export function galleryCodeProps(
  tile: WallTile,
  assets: GalleryAssets = {},
): QRProps {
  const styles = tileStyles(tile);
  const logo = tileLogo(tile);
  const props: QRProps = {
    value: tile.value,
    size: GALLERY_CODE_SIZE,
    bgColor: tile.transparent ? "transparent" : styles.bgColor,
    fgColor: styles.fgColor,
    eyeColor: styles.eyeColor,
    dotColor: styles.dotColor,
    bodyPattern: styles.bodyPattern,
    cornerEyePattern: styles.cornerEyePattern,
    cornerEyeDotPattern: styles.cornerEyeDotPattern,
    level: logo || tile.art ? "H" : styles.level,
    margin: styles.margin,
  };
  if (styles.templateId) props.templateId = styles.templateId;
  if (styles.frame) props.frame = styles.frame;
  if (logo) {
    if (!assets.logo) throw new Error(`Wall tile "${tile.id}" needs a logo`);
    const width = Math.round(GALLERY_CODE_SIZE * LOGO_SCALE);
    props.imageSettings = {
      src: assets.logo,
      width,
      height: width,
      excavate: true,
    };
  }
  if (tile.art) {
    if (!assets.artImage) {
      throw new Error(`Wall tile "${tile.id}" needs its art sample`);
    }
    const { mode, variant, intensity } = tile.art;
    props.art = { mode, variant, intensity, image: assets.artImage };
  }
  return props;
}
