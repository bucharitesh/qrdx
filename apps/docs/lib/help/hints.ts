// Copy and visuals for every <InfoHint id="…" /> in one place.
// Write for a first-time user: plain words, one or two short sentences,
// and only what the product really does.

/** Live examples drawn with the real qrdx engine (components/help/hint-visual.tsx). */
export type LiveExample =
  | "ai-prompt"
  | "art-modes"
  | "colors-contrast"
  | "custom-domain"
  | "destination-swap"
  | "dot-shapes"
  | "download-formats"
  | "error-levels"
  | "eye-shapes"
  | "frames"
  | "logo-before-after"
  | "print-bleed"
  | "print-distance"
  | "quiet-zone"
  | "react-component"
  | "scan-analytics"
  | "scan-grades"
  | "share-style"
  | "static-vs-dynamic"
  | "utm-url"
  | "webhook-payload";

export type HintVisual =
  /** Muted loop: /videos/help/<name>.{webm,mp4} with /images/help/<name>.webp as poster. */
  | { type: "video"; name: string; label: string }
  | { type: "live"; example: LiveExample; label: string }
  | { type: "image"; src: string; darkSrc?: string; label: string };

export interface Hint {
  title: string;
  body: string;
  visual?: HintVisual;
  /** A /docs page that explains more */
  docsHref?: string;
}

export const HINTS = {
  // ─── Playground: content ──────────────────────────────────────────────────
  "qr-types": {
    title: "Static, dynamic or hosted page",
    body: "Static types store the content inside the code, so they work forever but can't change after printing. A dynamic link or a hosted page stores a short link instead, so you can edit it any time.",
    visual: {
      type: "live",
      example: "static-vs-dynamic",
      label:
        "A static Wi-Fi code packed with dots next to a simpler dynamic code that holds only a short link",
    },
    docsHref: "/docs/dynamic-qr-codes",
  },
  "dynamic-qr": {
    title: "Dynamic QR code",
    body: "The code holds a short link that forwards to your website. Change the website later, even after printing, and see how many people scanned it.",
    visual: {
      type: "live",
      example: "destination-swap",
      label:
        "The same QR code stays put while the website it opens changes from a spring menu to a summer menu",
    },
    docsHref: "/docs/dynamic-qr-codes",
  },

  // ─── Playground: design ───────────────────────────────────────────────────
  colors: {
    title: "Colors and contrast",
    body: "Scanners look for dark dots on a light background. Keep the contrast at 4.5:1 or more; gradients work as long as every color stays dark.",
    visual: {
      type: "live",
      example: "colors-contrast",
      label:
        "A black code and a dark gradient code that scan, next to a pale grey code that won't scan",
    },
    docsHref: "/docs/features/colors-gradients",
  },
  dots: {
    title: "Dot shape",
    body: "The shape of the small squares that carry your data. Every shape here scans; solid shapes like square and circle hold up best when printed small.",
    visual: {
      type: "live",
      example: "dot-shapes",
      label:
        "One QR code switching between square, circle, diamond and vertical line dots",
    },
    docsHref: "/docs/features/patterns",
  },
  eyes: {
    title: "Eyes",
    body: "The three big corner squares show a scanner where the code is. Square, rounded and gear eyes read everywhere; circle and curly eyes fail in some apps.",
    visual: {
      type: "live",
      example: "eye-shapes",
      label: "One QR code switching between square, rounded and gear eyes",
    },
    docsHref: "/docs/features/patterns",
  },
  logo: {
    title: "Logo in the center",
    body: "Your logo sits in the middle and covers a few dots. Error correction rebuilds them, so set it to H (High) whenever a logo is on.",
    visual: {
      type: "live",
      example: "logo-before-after",
      label: "The same code without a logo and with a logo in the center",
    },
    docsHref: "/docs/features/logos",
  },
  frame: {
    title: "Frame",
    body: "Adds a border and a call to action such as “Scan me” around the code. Frames sit outside the code, so they never cover any dots.",
    visual: {
      type: "live",
      example: "frames",
      label:
        "One QR code shown with a banner, a border and a speech bubble frame",
    },
    docsHref: "/docs/features/frames",
  },
  "quiet-zone": {
    title: "Quiet zone",
    body: "The empty border scanners need to find the code. Keep at least 4 modules (dot widths), especially on busy or dark backgrounds.",
    visual: {
      type: "live",
      example: "quiet-zone",
      label:
        "On a striped background, a code with no border blends in, while a code with a 4-module white border stands out",
    },
  },
  art: {
    title: "Logo QR and Image QR",
    body: "Blends a picture into the dots themselves. Logo QR colors the dots inside your logo's shape; Image QR turns the whole code into your photo.",
    visual: {
      type: "live",
      example: "art-modes",
      label:
        "A plain code, a Logo QR with a flower logo and an Image QR made from a photo",
    },
    docsHref: "/docs/features/art-qr",
  },
  "error-correction": {
    title: "Error correction",
    body: "How much of the code can be covered or damaged and still scan. Higher levels add more dots; use H when you add a logo.",
    visual: {
      type: "live",
      example: "error-levels",
      label:
        "The same code with a logo at levels L, M, Q and H, getting denser at each level",
    },
    docsHref: "/docs/features/logos",
  },

  // ─── Playground: preview and dialogs ──────────────────────────────────────
  "scan-score": {
    title: "Scan score",
    body: "We decode your design at small sizes with camera blur, then check contrast, clear space, logo size and eyes. 85 or more is great; below 65, fix the checks marked with a cross.",
    visual: {
      type: "live",
      example: "scan-grades",
      label:
        "Score bands: Great from 85, OK from 65, Risky below 65, Fails when it doesn't decode",
    },
    docsHref: "/tools/scan-checker",
  },
  "download-formats": {
    title: "Which format?",
    body: "PNG and JPG are pixel images for screens, email and slides. SVG, PDF and EPS are vectors that stay sharp at any size, which is what printers want.",
    visual: {
      type: "live",
      example: "download-formats",
      label:
        "A corner of a QR code zoomed in: the PNG turns into blocky pixels, the SVG stays sharp",
    },
    docsHref: "/docs/features/downloads",
  },
  "print-ready": {
    title: "Bleed and crop marks",
    body: "Bleed adds 3 mm of extra background past the edge, so trimming never leaves a white line. Crop marks show the print shop where to cut.",
    visual: {
      type: "live",
      example: "print-bleed",
      label:
        "A print layout with the trim line, a 3 mm bleed and crop marks in the corners",
    },
    docsHref: "/docs/features/downloads",
  },
  "share-design": {
    title: "Share a design",
    body: "The link shares your style, not your content. Anyone who opens it gets your colors, dots and eyes in the playground and adds their own link.",
    visual: {
      type: "live",
      example: "share-style",
      label: "Two codes with the same style that open different links",
    },
  },
  "react-component": {
    title: "Use it in React",
    body: "Install the open-source qrdx package and paste this component into your app. Change value to point it anywhere; the other props keep this design.",
    visual: {
      type: "live",
      example: "react-component",
      label: "A short React snippet next to the QR code it renders",
    },
    docsHref: "/docs/components/qr-code",
  },
  "ai-generate": {
    title: "Generate with AI",
    body: "Describe a brand, a mood or a season, or attach up to 2 images, and the AI picks colors, dots and eyes. Type @ to build on a preset or your current style.",
    visual: {
      type: "live",
      example: "ai-prompt",
      label:
        "Example: the prompt “Cozy autumn café” turned into a warm brown code with rounded dots",
    },
  },

  // ─── Tools ────────────────────────────────────────────────────────────────
  "bulk-csv": {
    title: "Bulk from a CSV",
    body: "Save a spreadsheet as CSV with one row per code and pick the column with each link or text. You get a ZIP of up to 5,000 PNG or SVG files, made on your device.",
    visual: {
      type: "video",
      name: "bulk-csv",
      label:
        "Screen recording: a CSV dropped into the bulk generator, its columns mapped and a ZIP of QR codes generated",
    },
  },
  "print-size": {
    title: "Size from distance",
    body: "Make the code about a tenth of the scanning distance: 2 cm for a card read at 20 cm, 10 cm for a poster read from 1 m. Codes with more content need more room.",
    visual: {
      type: "live",
      example: "print-distance",
      label:
        "Codes sized 2 cm, 10 cm and 30 cm for scanning from 20 cm, 1 m and 3 m",
    },
  },
  "scan-checker": {
    title: "What the checker tests",
    body: "Drop in a photo or screenshot of any QR code. It reads what the code says, then tests it at small sizes with camera blur and checks contrast and clear space, all in your browser.",
    visual: {
      type: "video",
      name: "scan-checker",
      label:
        "Screen recording: a QR code image added to the scan checker and its score with the passed checks",
    },
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────
  "dynamic-destination": {
    title: "Destination",
    body: "Where people land after they scan. Change it any time and every printed copy of the code opens the new address.",
    visual: {
      type: "live",
      example: "destination-swap",
      label:
        "The same QR code stays put while the website it opens changes from a spring menu to a summer menu",
    },
    docsHref: "/docs/dynamic-qr-codes",
  },
  "custom-domains": {
    title: "Custom domains",
    body: "Your dynamic codes encode go.yourbrand.com/… instead of a qrdx.dev link, so people see your brand before they scan. Redirects, editing and analytics work the same.",
    visual: {
      type: "live",
      example: "custom-domain",
      label:
        "A short link changing from qrdx.dev/q/aB3dE5f to go.yourbrand.com/aB3dE5f",
    },
    docsHref: "/docs/custom-domains",
  },
  webhooks: {
    title: "Webhooks",
    body: "QRdx sends a JSON request to your URL when something happens, like a scan or a form answer. Use it to update your own app, or connect Zapier or Make.",
    visual: {
      type: "live",
      example: "webhook-payload",
      label: "A scan.created event sent as JSON to your server",
    },
    docsHref: "/docs/webhooks",
  },
  utm: {
    title: "UTM parameters",
    body: "Small tags added to the link each scan opens, so Google Analytics shows these visits came from your QR code. Fill in source, medium and campaign.",
    visual: {
      type: "live",
      example: "utm-url",
      label:
        "A website link with utm_source, utm_medium and utm_campaign added",
    },
    docsHref: "/docs/tracking-and-conversions",
  },
  "scan-analytics": {
    title: "Scan analytics",
    body: "A scan counts each time someone opens a dynamic code; bots, link previews and rapid repeats are skipped. Unique visitors are counted per day without storing IP addresses.",
    visual: {
      type: "live",
      example: "scan-analytics",
      label:
        "Example chart of scans over a week with total scans and unique visitors",
    },
    docsHref: "/docs/dynamic-qr-codes",
  },
} satisfies Record<string, Hint>;

export type HintId = keyof typeof HINTS;
