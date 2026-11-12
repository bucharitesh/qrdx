// The /barcode-generator page's long copy, in English. Translations come
// from the translation memory (lib/i18n/content-sources.ts lists this file).
import type { BarcodeFormatId } from "@/lib/barcode/formats";

/** When to use each symbology, in the generator's order. */
export const BARCODE_USES: Record<BarcodeFormatId, string> = {
  ean13:
    "The barcode on retail products almost everywhere outside North America. It holds a 13-digit GTIN: a company prefix from GS1, an item number and a check digit. Books use it too, for an ISBN starting 978 or 979.",
  ean8: "For packs too small for an EAN-13, such as a lipstick or a pack of gum. EAN-8 numbers are issued separately by GS1; you can't shorten an EAN-13 into one.",
  upca: "The 12-digit retail barcode of the US and Canada. Its number is the same as an EAN-13 that starts with 0, and checkout scanners read both.",
  upce: "A UPC-A squeezed to six digits for small packs. Only UPC-A numbers with zeros in the right places can be shortened; enter a 12-digit UPC-A and the generator tells you whether yours can.",
  code128:
    "The general-purpose barcode: letters, digits and symbols for asset tags, stock labels, tickets and shipping labels. It's compact and needs no registration, so use it whenever no retail standard applies.",
  code39:
    "Older and wider than Code 128, with capital letters, digits and a few symbols. Some industries and older systems still require it, and nearly every scanner reads it.",
  itf14:
    "Printed on corrugated cartons that hold retail products. It carries the 14-digit GTIN of the case, and its thick frame (bearer bars) evens out printing pressure and stops scanners reading only part of it.",
  "gs1-128":
    "Several pieces of supply chain data in one barcode, each marked by an Application Identifier: (01) GTIN, (10) batch, (17) expiry date, (00) SSCC for a pallet. Used on cases, pallets and logistics labels.",
  datamatrix:
    "A small square 2D code that holds a lot in little space, used to mark parts, electronics and labels. This is plain Data Matrix; the GS1 version required on some regulated packaging isn't offered here.",
  pdf417:
    "A stacked 2D code that holds up to about a kilobyte of text. You'll find it on driver's licenses, ID cards and boarding passes.",
  aztec:
    "A square 2D code found from its center, so it needs no blank margin. Transport operators use it for tickets shown on phone screens and printed at home.",
};

/** The page FAQ. */
export const BARCODE_FAQS: { question: string; answer: string }[] = [
  {
    question: "Is this barcode generator free?",
    answer:
      "Yes. There's no account, no watermark and no limit on downloads. Barcodes are drawn and checked in your browser, so nothing you type is sent to QRdx, except when you pick WebP or AVIF (QRdx's server encodes those and keeps nothing) or save a barcode to your dashboard.",
  },
  {
    question: "Do I need to register my barcode number?",
    answer:
      "For products sold in shops, yes. EAN, UPC, ITF-14 and GS1-128 carry a GTIN, and GTINs are licensed to your company by GS1 (or GS1's organization in your country); retailers' systems won't recognize a made-up number. This generator draws any valid number, but it doesn't issue or register numbers. For your own stock, assets or tickets, Code 128 and Code 39 need no registration.",
  },
  {
    question: "Does it add the check digit?",
    answer:
      "Yes, for EAN-13, EAN-8, UPC-A, UPC-E, ITF-14 and the GTIN and SSCC fields of GS1-128: leave the last digit off and it's worked out. Enter the full number and the check digit is verified; a wrong one shows an error instead of a barcode.",
  },
  {
    question: "Will my barcode scan?",
    answer:
      "As you edit, the generator decodes the PNG it would download with ZXing, an open-source barcode reader, and tells you whether it reads back the value you entered. It also warns about low contrast, light bars on a dark background, red bars and a quiet zone below the minimum. It can't see your printer, label stock or lighting, so print a test and scan it with the scanners that will read it.",
  },
  {
    question: "Which file format should I download?",
    answer:
      "SVG, PDF or EPS for print: they're vectors, so the bars stay sharp at any size. SVG and EPS open in design tools such as Illustrator, InDesign and Affinity, and PDF opens anywhere. PNG is for screens, documents and online shops, and JPG for places that don't take PNG; WebP and AVIF make smaller files for websites. Raise the image size for bigger pictures.",
  },
  {
    question: "Can I save my barcodes?",
    answer:
      "Yes, with a free QRdx account. Signed in, press Save to dashboard and the barcode goes to Barcodes in your workspace, where you can find it again, edit it, put it in a folder and download it in any format. Every plan saves barcodes: 1,000 on Free.",
  },
  {
    question: "Is there a barcode API?",
    answer:
      "Yes. https://api.qrdx.dev/v1/barcode?format=ean13&data=590123412345 returns that EAN-13 as an SVG, with no key; add type=png, type=pdf or another file type. It checks values the same way this page does. With an API key you can also save barcodes to your workspace. Every option is in the docs at qrdx.dev/docs/developers/barcode-api.",
  },
  {
    question: "Can I track scans of a barcode?",
    answer:
      "No. Barcodes are static: the data is in the bars, and scanners read it without going online, so there's nothing to count. They don't expire either. If you need scan statistics, use a dynamic QR code, which points to a short link you can edit and track.",
  },
  {
    question: "What is the quiet zone?",
    answer:
      "The blank margin on each side of the bars. Scanners use it to find where the barcode starts and ends: EAN-13 needs 11 modules (narrow bar widths), Code 128 needs 10. The generator starts at the minimum and warns if you go below it; if you trim it, leave the space in your layout.",
  },
  {
    question: "What's the difference between a barcode and a QR code?",
    answer:
      "A linear barcode holds a short number or text in a row of bars, read by the laser and camera scanners at checkouts and in warehouses. A QR code is a 2D code that holds much more, such as a web address, and phone cameras read it on their own. For links, use a QR code.",
  },
];

/** Printing tips, in order. */
export const BARCODE_TIPS: string[] = [
  "Dark bars on a light background. Black on white is safest; dark blue and dark green work. Many scanners read with red light, which makes red, orange and yellow bars disappear.",
  "Keep the quiet zone clear: no text, borders or artwork in the blank margin either side.",
  "Retail EAN and UPC barcodes may be printed from 80% to 200% of their nominal size (an EAN-13 at 100% is 37.29 mm wide). The SVG, PDF and EPS downloads use a 0.35 mm module, about 107%. Scale them within that range, and don't cut the bar height.",
  "Print the barcode, then scan it with the scanners that will read it before a large run.",
];
