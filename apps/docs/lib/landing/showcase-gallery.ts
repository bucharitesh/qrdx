import { getFrameLayout, isFrameActive } from "qrdx";
import type { QRArtImage, QRArtMode, QRArtVariant, QRProps } from "qrdx/types";
import { demoPath } from "@/lib/landing/demo-paths";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import { encodeQRContent } from "@/utils/qr-content-encoder";
import { defaultPresets } from "@/utils/qr-presets";

/**
 * The home page gallery (components/sections/home/gallery-section.tsx): real
 * codes in the built-in themes (utils/qr-presets.ts), one per content type
 * and one per style feature, so the page shows what QRdx makes instead of one
 * house style. Each image is drawn by the engine on the server
 * (app/gallery/[file]/route.ts) and tests/home/gallery-scan.test.ts decodes
 * every one, so a style change can't ship a code that doesn't scan.
 *
 * Sample values are obviously samples: qrdx.dev pages, example.com
 * addresses and a 555-01xx phone number, which is reserved for fiction.
 */

export const GALLERY_FILTERS = [
  { value: "style", label: "Styles" },
  { value: "content", label: "Content types" },
] as const;

export type GalleryFilter = (typeof GALLERY_FILTERS)[number]["value"];

/** A sample from public/images/art-samples, sampled as the editor does. */
export type GalleryArtSample = "bloom" | "dog";

export interface GalleryCode {
  /** Slug for the image URL: /gallery/<id>.svg */
  id: string;
  filter: GalleryFilter;
  /** Short name on the tile, e.g. "Wi-Fi". */
  label: string;
  /** One line under the label. */
  detail: string;
  /** What the image shows, for screen readers and image search. */
  alt: string;
  /** What the code holds; scanning it gives exactly this. */
  value: string;
  /** Built-in theme the code is drawn in (a key of defaultPresets). */
  preset: string;
  /** Where the tile goes. */
  href: string;
  /** Style tiles of a plain theme: clicking opens it in the playground. */
  appliesPreset?: boolean;
  /** Center logo: a sample mark from public/images/art-samples/logos. */
  logo?: "cafe";
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
}

const SITE = "https://qrdx.dev";
/** 555-0100 to 555-0199 are reserved for fictional use in North America. */
const SAMPLE_PHONE = "+1 415 555 0132";
const SAMPLE_GREETING = "Hello from QRdx";

const encode = (content: QRContentConfig) => encodeQRContent(content);
const page = (type: string, id: string) => `${SITE}${demoPath(type, id)}`;
const generator = (type: ContentType) => `/qr-code-generator/${type}`;
const theme = (id: string) => `${defaultPresets[id]?.label ?? id} theme`;

/** The playground's Design tab, where logos and Logo QR or Image QR art live. */
const DESIGN_TAB = "/playground?tab=customisations";

const content: GalleryCode[] = [
  {
    id: "website",
    filter: "content",
    label: "Website",
    detail: "Opens a link",
    alt: "QR code for a website, blue gradient dots",
    value: encode({ type: "url", url: SITE }),
    preset: "gradientBlue",
    href: generator("url"),
  },
  {
    id: "wifi",
    filter: "content",
    label: "Wi-Fi",
    detail: "Joins the network",
    alt: "Wi-Fi QR code in a frame that says Join our Wi-Fi",
    value: encode({
      type: "wifi",
      ssid: "QRdx Sample",
      password: "sample-only",
      encryption: "WPA",
    }),
    preset: "guestWifi",
    href: generator("wifi"),
  },
  {
    id: "contact",
    filter: "content",
    label: "Contact",
    detail: "Saves a vCard",
    alt: "Contact card QR code in a frame that says Save my contact",
    value: encode({
      type: "vcard",
      firstName: "Sam",
      lastName: "Sample",
      // Name and email only: each extra field makes the code denser.
      email: "sam@example.com",
    }),
    preset: "businessCard",
    href: generator("vcard"),
  },
  {
    id: "menu",
    filter: "content",
    label: "Menu page",
    detail: "Opens a hosted menu",
    alt: "QR code on a menu card that says Scan for the menu",
    value: page("menu", "cafe"),
    preset: "restaurantMenu",
    href: demoPath("menu", "cafe"),
  },
  {
    id: "event",
    filter: "content",
    label: "Event page",
    detail: "Opens a hosted event",
    alt: "QR code on a ticket that says Your ticket",
    value: page("event", "conference"),
    preset: "eventTicket",
    href: demoPath("event", "conference"),
  },
  {
    id: "upi",
    filter: "content",
    label: "UPI payment",
    detail: "Opens a UPI app to pay",
    alt: "UPI payment QR code in green",
    value: encode({
      type: "upi",
      upiId: "sample@example",
      name: "QRdx Sample",
    }),
    preset: "emerald",
    href: generator("upi"),
  },
  {
    id: "email",
    filter: "content",
    label: "Email",
    detail: "Drafts an email",
    alt: "Email QR code with lilac dots",
    value: encode({
      type: "email",
      recipient: "hello@example.com",
      subject: SAMPLE_GREETING,
    }),
    preset: "lavender",
    href: generator("email"),
  },
  {
    id: "sms",
    filter: "content",
    label: "SMS",
    detail: "Writes a text",
    alt: "SMS QR code in pink",
    value: encode({
      type: "sms",
      phoneNumber: SAMPLE_PHONE,
      message: SAMPLE_GREETING,
    }),
    preset: "bubblegum",
    href: generator("sms"),
  },
  {
    id: "whatsapp",
    filter: "content",
    label: "WhatsApp",
    detail: "Starts a chat",
    alt: "WhatsApp QR code with speech-bubble eyes",
    value: encode({
      type: "whatsapp",
      phoneNumber: SAMPLE_PHONE,
      message: SAMPLE_GREETING,
    }),
    preset: "message",
    href: generator("whatsapp"),
  },
  {
    id: "phone",
    filter: "content",
    label: "Phone",
    detail: "Calls a number",
    alt: "Phone call QR code in peach",
    value: encode({ type: "phone", phoneNumber: SAMPLE_PHONE }),
    preset: "pastelDream",
    href: generator("phone"),
  },
  {
    id: "links",
    filter: "content",
    label: "Link in bio",
    detail: "Opens a link page",
    alt: "QR code with violet to orange gradient dots",
    value: page("links", "creator"),
    preset: "instagram",
    href: demoPath("links", "creator"),
  },
  {
    id: "coupon",
    filter: "content",
    label: "Coupon",
    detail: "Opens a hosted coupon",
    alt: "QR code on a tag that says Scan for 20% off",
    value: page("coupon", "store-discount"),
    preset: "retailSale",
    href: demoPath("coupon", "store-discount"),
  },
];

const style: GalleryCode[] = [
  {
    id: "liquid",
    filter: "style",
    label: "Liquid",
    detail: theme("amethystHaze"),
    alt: "QR code with flowing liquid modules in purple",
    value: SITE,
    preset: "amethystHaze",
    href: "/playground",
    appliesPreset: true,
  },
  {
    id: "leaf-eyes",
    filter: "style",
    label: "Leaf eyes",
    detail: theme("harbor"),
    alt: "QR code with leaf-shaped corner eyes in navy",
    value: SITE,
    preset: "harbor",
    href: "/playground",
    appliesPreset: true,
  },
  {
    id: "hearts",
    filter: "style",
    label: "Hearts",
    detail: theme("sweetheart"),
    alt: "QR code made of small hearts",
    value: SITE,
    preset: "sweetheart",
    href: "/playground",
    appliesPreset: true,
  },
  {
    id: "octagons",
    filter: "style",
    label: "Octagons",
    detail: theme("fire"),
    alt: "QR code made of orange octagons",
    value: SITE,
    preset: "fire",
    href: "/playground",
    appliesPreset: true,
  },
  {
    id: "gradient",
    filter: "style",
    label: "Gradient",
    detail: theme("rainbow"),
    alt: "QR code in a four-color gradient",
    value: SITE,
    preset: "rainbow",
    href: "/playground",
    appliesPreset: true,
  },
  {
    // Not a light-on-dark theme: the scan score warns that some scanner
    // apps can't read those, so the gallery shows none.
    id: "eye-colors",
    filter: "style",
    label: "Eye colors",
    detail: theme("royal"),
    alt: "Navy QR code with gold centers in its corner eyes",
    value: SITE,
    preset: "royal",
    href: "/playground",
    appliesPreset: true,
  },
  {
    id: "frame",
    filter: "style",
    label: "Frame",
    detail: theme("realEstate"),
    alt: "QR code with a banner that says Book a viewing",
    value: page("vcard", "realtor"),
    preset: "realEstate",
    href: "/playground",
    appliesPreset: true,
  },
  {
    id: "logo",
    filter: "style",
    label: "Logo",
    detail: "Any image in the center",
    alt: "QR code with a coffee cup logo in the center",
    value: page("menu", "cafe"),
    preset: "caffeine",
    logo: "cafe",
    href: "/docs/help/designing/logos",
  },
  {
    id: "logo-qr",
    filter: "style",
    label: "Logo QR",
    detail: "Logo traced into the code",
    alt: "QR code filled with a pink flower logo",
    value: SITE,
    preset: "classic",
    art: { mode: "logo", variant: "blend", intensity: 0.7, sample: "bloom" },
    href: DESIGN_TAB,
  },
  {
    id: "image-qr",
    filter: "style",
    label: "Image QR",
    detail: "A photo in every module",
    alt: "QR code showing a photo of a dog through its modules",
    value: SITE,
    preset: "slate",
    art: {
      mode: "halftone",
      variant: "color",
      intensity: 0.7,
      sample: "dog",
    },
    href: DESIGN_TAB,
  },
  {
    id: "transparent",
    filter: "style",
    label: "Transparent",
    detail: "No background color",
    alt: "QR code with a transparent background",
    value: SITE,
    preset: "gilt",
    transparent: true,
    href: "/docs/features/downloads",
  },
  {
    id: "print",
    filter: "style",
    label: "Print-ready",
    detail: "CMYK PDF and EPS",
    alt: "QR code inside printer's crop marks",
    value: SITE,
    preset: "folio",
    print: true,
    href: "/docs/help/getting-started/download-and-print",
  },
];

export const GALLERY_CODES: readonly GalleryCode[] = [...style, ...content];

export function getGalleryCode(id: string): GalleryCode | undefined {
  return GALLERY_CODES.find((code) => code.id === id);
}

/** Image URL of a gallery code (app/gallery/[file]/route.ts). */
export const galleryImagePath = (code: Pick<GalleryCode, "id">) =>
  `/gallery/${code.id}.svg`;

/** Width the codes are drawn at, before any frame. */
export const GALLERY_CODE_SIZE = 240;

/**
 * The checkerboard behind the transparent code: light in both color
 * schemes, so the code reads there as it would on paper (the scan test
 * decodes it on the darker square too).
 */
export const GALLERY_CHECKER = { light: "#ffffff", dark: "#e5e5e5" } as const;

/** A gallery image's URL and intrinsic size (a frame makes it larger). */
export function galleryImage(code: GalleryCode): {
  src: string;
  width: number;
  height: number;
  framed: boolean;
} {
  const src = galleryImagePath(code);
  const { frame, bgColor } = defaultPresets[code.preset]?.styles ?? {};
  if (!(frame && isFrameActive(frame))) {
    const size = GALLERY_CODE_SIZE;
    return { src, width: size, height: size, framed: false };
  }
  const layout = getFrameLayout(GALLERY_CODE_SIZE, frame, bgColor);
  return { src, width: layout.width, height: layout.height, framed: true };
}

/** Center logo width, as a share of the code (the editor's logos are 25%). */
const LOGO_SCALE = 0.24;

export interface GalleryAssets {
  /** The center logo as a data URI (it must be inline: the SVG is an <img>). */
  logo?: string;
  /** The sampled art image, for Logo QR and Image QR. */
  artImage?: QRArtImage;
}

/** Props for `<QRCodeSVG>` drawing a gallery code in its theme. */
export function galleryCodeProps(
  code: GalleryCode,
  assets: GalleryAssets = {},
): QRProps {
  const preset = defaultPresets[code.preset];
  if (!preset) throw new Error(`Unknown gallery theme "${code.preset}"`);
  const styles = preset.styles;
  const props: QRProps = {
    value: code.value,
    size: GALLERY_CODE_SIZE,
    bgColor: code.transparent ? "transparent" : styles.bgColor,
    fgColor: styles.fgColor,
    eyeColor: styles.eyeColor,
    dotColor: styles.dotColor,
    bodyPattern: styles.bodyPattern,
    cornerEyePattern: styles.cornerEyePattern,
    cornerEyeDotPattern: styles.cornerEyeDotPattern,
    level: code.logo || code.art ? "H" : styles.level,
    margin: styles.margin,
  };
  if (styles.frame) props.frame = styles.frame;
  if (code.logo) {
    if (!assets.logo) throw new Error(`Gallery code "${code.id}" needs a logo`);
    const width = Math.round(GALLERY_CODE_SIZE * LOGO_SCALE);
    props.imageSettings = {
      src: assets.logo,
      width,
      height: width,
      excavate: true,
    };
  }
  if (code.art) {
    if (!assets.artImage) {
      throw new Error(`Gallery code "${code.id}" needs its art sample`);
    }
    const { mode, variant, intensity } = code.art;
    props.art = { mode, variant, intensity, image: assets.artImage };
  }
  return props;
}
