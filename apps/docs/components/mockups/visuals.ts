import { mediaUrl } from "@/lib/media";
import type { QrTypeGroup } from "@/lib/qr-types-content";

// Every marketing image and clip in one place. Paths are under apps/docs/public.
// Product screenshots and video posters are real captures of the app.
// Use-case illustrations are drawn in code by scripts/use-case-art (light and
// dark files), each with a real QR code rendered by qrdx.

export interface Visual {
  src: string;
  darkSrc?: string;
  width: number;
  height: number;
  alt: string;
}

export const productShots = {
  wifiGenerator: {
    src: "/images/product/generator-wifi-light.webp",
    darkSrc: "/images/product/generator-wifi-dark.webp",
    width: 1222,
    height: 594,
    alt: "Wi-Fi QR code generator with network name, security type and password fields and a QR code preview with PNG and SVG download buttons",
  },
  scanChecker: {
    src: "/images/product/tool-scan-checker-light.webp",
    darkSrc: "/images/product/tool-scan-checker-dark.webp",
    width: 928,
    height: 886,
    alt: "QR code scan checker result: score 100, the decoded link and passed checks for small sizes, contrast and clear space",
  },
  bulkGenerator: {
    src: "/images/product/tool-bulk-light.webp",
    darkSrc: "/images/product/tool-bulk-dark.webp",
    width: 1222,
    height: 592,
    alt: "Bulk QR code generator with an uploaded seven-row CSV, column mapping, style and format options and a Generate 7 codes button",
  },
  printSize: {
    src: "/images/product/tool-print-size-light.webp",
    darkSrc: "/images/product/tool-print-size-dark.webp",
    width: 1222,
    height: 456,
    alt: "QR code print size calculator showing a 100 mm minimum code size for a 1 meter scanning distance",
  },
} satisfies Record<string, Visual>;

export interface LoopClip {
  mp4: string;
  webm: string;
  poster: string;
  width: number;
  height: number;
  label: string;
}

// Recorded by the coordinator from the real UI (scripts in the M1 report).
// Posters are real screenshots, so the slot looks right before the clips exist.
export const loopVideos = {
  playground: {
    mp4: mediaUrl("/videos/playground-style-export.mp4"),
    webm: mediaUrl("/videos/playground-style-export.webm"),
    poster: "/images/product/video-poster-playground.webp",
    width: 1280,
    height: 800,
    label:
      "Screen recording: a link typed into the QRdx playground, a style picked from the theme gallery, a linear gradient set in the color picker, the frame text changed to Scan to visit in the preview, the Art tab opened, then the download dialog",
  },
  bulk: {
    mp4: mediaUrl("/videos/bulk-csv-to-zip.mp4"),
    webm: mediaUrl("/videos/bulk-csv-to-zip.webm"),
    poster: "/images/product/video-poster-bulk.webp",
    width: 1200,
    height: 600,
    label:
      "Screen recording: a seven-row CSV uploaded to the bulk generator, columns mapped and seven QR codes generated into a ZIP file",
  },
  scanChecker: {
    mp4: mediaUrl("/videos/scan-checker.mp4"),
    webm: mediaUrl("/videos/scan-checker.webm"),
    poster: "/images/product/video-poster-scan-checker.webp",
    width: 928,
    height: 880,
    label:
      "Screen recording: a QR code image dropped into the scan checker, which decodes it and shows a score of 100 with every check passed",
  },
} satisfies Record<string, LoopClip>;

export const useCaseImages = {
  cafeTableTent: {
    src: "/images/use-cases/cafe-table-tent-light.svg",
    darkSrc: "/images/use-cases/cafe-table-tent-dark.svg",
    width: 800,
    height: 600,
    alt: "Drawing of a table tent with a menu QR code on a café table, beside a cup of coffee",
  },
  businessCard: {
    src: "/images/use-cases/business-card-light.svg",
    darkSrc: "/images/use-cases/business-card-dark.svg",
    width: 800,
    height: 600,
    alt: "Drawing of business cards with a QR code stacked on a desk, beside a pen",
  },
  hotelWifi: {
    src: "/images/use-cases/hotel-wifi-sign-light.svg",
    darkSrc: "/images/use-cases/hotel-wifi-sign-dark.svg",
    width: 800,
    height: 600,
    alt: "Drawing of an acrylic stand with a Wi-Fi QR code on a hotel counter, beside a service bell",
  },
  marketStallUpi: {
    src: "/images/use-cases/market-stall-upi-light.svg",
    darkSrc: "/images/use-cases/market-stall-upi-dark.svg",
    width: 800,
    height: 600,
    alt: "Drawing of a phone scanning a payment QR code stand on a market stall, beside a crate of fruit",
  },
  productPackaging: {
    src: "/images/use-cases/product-packaging-light.svg",
    darkSrc: "/images/use-cases/product-packaging-dark.svg",
    width: 800,
    height: 600,
    alt: "Drawing of stacked boxes, each with a round QR code sticker",
  },
  eventCheckIn: {
    src: "/images/use-cases/event-check-in-light.svg",
    darkSrc: "/images/use-cases/event-check-in-dark.svg",
    width: 800,
    height: 600,
    alt: "Drawing of a check-in sign with a QR code on a registration desk, beside badges and lanyards",
  },
  retailShelf: {
    src: "/images/use-cases/retail-shelf-tag-light.svg",
    darkSrc: "/images/use-cases/retail-shelf-tag-dark.svg",
    width: 800,
    height: 600,
    alt: "Drawing of a QR code tag hanging from a shop shelf of mugs",
  },
  busStopPoster: {
    src: "/images/use-cases/bus-stop-poster-light.svg",
    darkSrc: "/images/use-cases/bus-stop-poster-dark.svg",
    width: 800,
    height: 600,
    alt: "Drawing of a poster with a large QR code on a bus shelter",
  },
} satisfies Record<string, Visual>;

/** One illustration per generator category, shared by the hub and every type page in it. */
export const qrTypeGroupImages: Record<QrTypeGroup, Visual> = {
  utilities: useCaseImages.hotelWifi,
  contact: useCaseImages.businessCard,
  social: useCaseImages.busStopPoster,
  payments: useCaseImages.marketStallUpi,
  business: useCaseImages.eventCheckIn,
  shopping: useCaseImages.retailShelf,
};
