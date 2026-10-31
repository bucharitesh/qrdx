import { mediaUrl } from "@/lib/media";
import type { QrTypeGroup } from "@/lib/qr-types-content";

// Every marketing image and clip in one place. Paths are under apps/docs/public.
// Product screenshots and video posters are real captures of the app.
// Use-case photos are generated from .claude/build/visuals-plan.json (same
// paths and sizes); the QR codes in them are illustrative.

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
      "Screen recording: a link typed into the QRdx playground, dot patterns changed in the customisation panel, then the download dialog opened",
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
    src: "/images/use-cases/cafe-table-tent.webp",
    width: 1200,
    height: 900,
    alt: "Table tent with a QR code for the menu on a wooden café table next to a cup of coffee",
  },
  businessCard: {
    src: "/images/use-cases/business-card.webp",
    width: 1200,
    height: 900,
    alt: "Business card with a QR code on a desk beside a notebook and pen",
  },
  hotelWifi: {
    src: "/images/use-cases/hotel-wifi-sign.webp",
    width: 1200,
    height: 900,
    alt: "Small sign with a Wi-Fi QR code on a hotel reception desk",
  },
  marketStallUpi: {
    src: "/images/use-cases/market-stall-upi.webp",
    width: 1200,
    height: 900,
    alt: "Hand holding a phone up to a payment QR code stand at a fruit market stall",
  },
  productPackaging: {
    src: "/images/use-cases/product-packaging.webp",
    width: 1200,
    height: 900,
    alt: "Kraft paper product boxes with printed QR code labels",
  },
  eventCheckIn: {
    src: "/images/use-cases/event-check-in.webp",
    width: 1200,
    height: 900,
    alt: "Event check-in desk with a QR code stand next to name badges and lanyards",
  },
  retailShelf: {
    src: "/images/use-cases/retail-shelf-tag.webp",
    width: 1200,
    height: 900,
    alt: "Shelf tag with a QR code below handmade mugs in a shop",
  },
  busStopPoster: {
    src: "/images/use-cases/bus-stop-poster.webp",
    width: 1200,
    height: 900,
    alt: "Poster with a large QR code in a bus stop shelter, seen from a few steps away",
  },
} satisfies Record<string, Visual>;

/** One photo per generator category, shared by the hub and every type page in it. */
export const qrTypeGroupImages: Record<QrTypeGroup, Visual> = {
  utilities: useCaseImages.hotelWifi,
  contact: useCaseImages.businessCard,
  social: useCaseImages.busStopPoster,
  payments: useCaseImages.marketStallUpi,
  business: useCaseImages.eventCheckIn,
  shopping: useCaseImages.retailShelf,
};
