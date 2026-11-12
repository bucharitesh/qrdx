// The /barcode-generator/<format> pages' copy, in English: one page per
// symbology in lib/barcode/formats.ts. Translations come from the
// translation memory (lib/i18n/content-sources.ts lists this file).
//
// Input rules and check digits come from lib/barcode/formats.ts and are
// worked out on the page; the copy here explains them. GS1 sizes are from
// the GS1 General Specifications. DOWNLOAD_SIZES_MM is what the vector
// downloads of each format's example measure at the default settings;
// tests/barcode/format-pages.test.ts draws them and fails when they drift.
import type { BarcodeFormatId } from "@/lib/barcode/formats";

export interface BarcodeFormatPage {
  id: BarcodeFormatId;
  /** The URL segment: /barcode-generator/<slug> */
  slug: string;
  /** H1 and <title> (before the "| QRdx" suffix) */
  title: string;
  /** At most 155 characters */
  metaDescription: string;
  /** The hero paragraph */
  intro: string;
  /** "Where <name> barcodes are used" */
  usedFor: string[];
  /** Do you need GS1 numbers (or anything else) for it */
  numbers: { title: string; paragraphs: string[] };
  /** How the input and check digit work, beside the worked example */
  rules: string[];
  /** Print size guidance, beside the download size */
  sizing: string[];
  faqs: { question: string; answer: string }[];
}

/**
 * Width × height of the example's SVG, PDF and EPS at the default settings,
 * rounded as the generator shows them.
 */
export const DOWNLOAD_SIZES_MM: Record<
  BarcodeFormatId,
  { width: number; height: number }
> = {
  ean13: { width: 45.1, height: 27.8 },
  ean8: { width: 28.6, height: 22.8 },
  upca: { width: 47.2, height: 27.8 },
  upce: { width: 30.3, height: 27.8 },
  code128: { width: 69.9, height: 19.2 },
  code39: { width: 57.5, height: 19.2 },
  itf14: { width: 60.4, height: 31.7 },
  "gs1-128": { width: 100.9, height: 19.2 },
  datamatrix: { width: 15.5, height: 15.5 },
  pdf417: { width: 43.7, height: 8.8 },
  aztec: { width: 19, height: 19 },
};

/** Names of the GS1 Application Identifiers the GS1-128 page's example uses, and a few more. */
export const GS1_AI_NAMES: Record<string, string> = {
  "00": "SSCC: the pallet or shipment",
  "01": "GTIN of the product or case",
  "02": "GTIN of the items inside a logistic unit",
  "10": "Batch or lot number",
  "11": "Production date (YYMMDD)",
  "15": "Best before date (YYMMDD)",
  "17": "Expiry date (YYMMDD)",
  "21": "Serial number",
};

const GS1_NUMBERS =
  "A GTIN is licensed, not bought outright: you join GS1 (or the GS1 organization in your country), get a company prefix and number your products from it. Large retailers and marketplaces check GTINs against GS1's registry, so numbers resold from someone else's prefix can be rejected.";

export const BARCODE_FORMAT_PAGES: readonly BarcodeFormatPage[] = [
  {
    id: "ean13",
    slug: "ean-13",
    title: "Free EAN-13 Barcode Generator",
    metaDescription:
      "Make an EAN-13 barcode for retail products. Type 12 digits and the check digit is added, or 13 to have it checked. SVG, PDF, EPS and PNG. Free, no signup.",
    intro:
      "EAN-13 is the barcode on retail products almost everywhere outside the US and Canada. Type the 12 digits of your number and the generator adds the check digit, or type all 13 and it checks yours, then download the barcode as a vector for print or a PNG for screens.",
    usedFor: [
      "Products sold in shops and online marketplaces. The 13 digits are a GTIN-13: a GS1 company prefix, an item number and a check digit. The first digits show which GS1 organization issued the prefix, not where the product was made.",
      "Books and magazines use it too: an ISBN starting with 978 or 979 is printed as an EAN-13, and 977 marks an ISSN for periodicals. Numbers starting with 2 are kept for in-store use, such as weighed items priced at the counter.",
    ],
    numbers: {
      title: "Do I need GS1 numbers for EAN-13?",
      paragraphs: [
        `For anything sold through a retailer, yes. ${GS1_NUMBERS}`,
        "This generator draws any valid 13-digit number, but it doesn't issue or register numbers. For your own stock, shelves or assets, use Code 128 instead: it needs no registration.",
      ],
    },
    rules: [
      "Spaces and dashes are ignored, and only digits are allowed. Twelve digits get the check digit added; thirteen have the last one checked, and a wrong check digit shows an error instead of a barcode.",
      "The check digit weighs the digits 3, 1, 3, 1… starting from the right of the 12-digit body, adds them up and picks the digit that brings the sum to the next multiple of 10.",
    ],
    sizing: [
      "At 100% an EAN-13 is 37.29 mm wide (quiet zones included) by 25.93 mm high, with a 0.33 mm module. GS1 allows 80% to 200% for retail.",
      "The vector downloads use a 0.353 mm module, about 107%. Scale them within the 80% to 200% range and keep the proportions: shortening the bars makes the barcode harder to scan at checkouts.",
      "Leave 11 modules of blank space on the left and 7 on the right. The generator starts with 11 on both sides.",
    ],
    faqs: [
      {
        question: "Can I make up an EAN-13 number?",
        answer:
          "It will scan, but a store's system won't recognize it and may already use that number for another product. Retail EAN-13 numbers come from a GS1 company prefix. Numbers starting with 2 are the exception: they're meant for use inside one store or company.",
      },
      {
        question: "What's the difference between EAN-13 and UPC-A?",
        answer:
          "A UPC-A is a 12-digit number that equals an EAN-13 starting with 0, and checkout scanners read both. US and Canadian retailers often ask for UPC-A; elsewhere EAN-13 is the norm.",
      },
      {
        question: "Can I make an ISBN barcode?",
        answer:
          "Yes: an ISBN-13 is an EAN-13. Enter the 13 digits without dashes. The 5-digit price add-on some book trades print beside it isn't drawn here.",
      },
      {
        question: "Why does my 13-digit number show an error?",
        answer:
          "Its last digit isn't the check digit the other 12 produce, which usually means a typo. The error says what the check digit should be. Enter only the first 12 digits to have it worked out.",
      },
    ],
  },
  {
    id: "upca",
    slug: "upc-a",
    title: "Free UPC-A Barcode Generator",
    metaDescription:
      "Make a UPC-A barcode for products sold in the US and Canada. Type 11 digits and the check digit is added, or 12 to have it checked. SVG, PDF, EPS and PNG.",
    intro:
      "UPC-A is the 12-digit retail barcode of the US and Canada. Type the first 11 digits and the generator adds the check digit, or type all 12 to have it checked, then download a vector for your packaging or a PNG for an online listing.",
    usedFor: [
      "Products sold in US and Canadian stores and on marketplaces that ask for a UPC. The number is a GTIN-12: a GS1 company prefix, an item number and a check digit.",
      "The first digit says what kind of number it is: 2 is kept for weighed items priced in the store, and 3 for medicines that carry a US National Drug Code. Since 2005, checkout systems in the US and Canada read EAN-13 too, but many retailers still ask for UPC-A.",
    ],
    numbers: {
      title: "Do I need GS1 numbers for UPC-A?",
      paragraphs: [
        `For retail, yes. ${GS1_NUMBERS} In the US, that's GS1 US.`,
        "This generator draws any valid number; it doesn't issue or register them.",
      ],
    },
    rules: [
      "Digits only; spaces and dashes are ignored. Eleven digits get the check digit added, twelve have it checked.",
      "The check digit triples the digits in odd positions (1st, 3rd, 5th… of the 11), adds the rest and picks the digit that brings the total to the next multiple of 10. It's the same rule as EAN-13, so a UPC-A with a 0 in front is a valid EAN-13.",
    ],
    sizing: [
      "At 100% a UPC-A is 37.29 mm wide with its quiet zones and a 0.33 mm module; GS1 allows 80% to 200%.",
      "The vector downloads use a 0.353 mm module, about 107%. Keep the proportions when you scale, and don't shorten the bars to fit a small pack: use UPC-E if the product qualifies.",
      "Keep at least 9 modules clear on each side. The generator starts with 11.",
    ],
    faqs: [
      {
        question: "Is a UPC the same as a GTIN?",
        answer:
          "The number in a UPC-A barcode is a GTIN-12. Written with two leading zeros it's the GTIN-14 that some product feeds ask for.",
      },
      {
        question: "My scanner reads 13 digits from a UPC-A. Is that wrong?",
        answer:
          "No. Many readers report a UPC-A as the 13-digit EAN with a 0 in front. The scan check on this page accepts both.",
      },
      {
        question: "Can I turn my UPC-A into a smaller UPC-E?",
        answer:
          "Only if the number has zeros in the right places. Open the UPC-E generator and enter the 12-digit UPC-A: it tells you whether yours can be shortened.",
      },
    ],
  },
  {
    id: "code128",
    slug: "code-128",
    title: "Free Code 128 Barcode Generator",
    metaDescription:
      "Make a Code 128 barcode for labels, asset tags and tickets: letters, digits and symbols, up to 80 characters. Scan-checked in the browser. SVG, PDF, PNG.",
    intro:
      "Code 128 is the general-purpose barcode: letters, digits, spaces and keyboard symbols in a compact row of bars. Type your text, check that it scans and download it for labels, asset tags, tickets or stock bins. It needs no registration.",
    usedFor: [
      "Inventory and stock labels, asset tags, library and lab samples, tickets, internal shipping labels and order numbers: anything that needs a barcode but isn't a product sold in shops.",
      "It's the barcode most warehouse and point-of-sale scanners read out of the box, and the base of GS1-128, which adds Application Identifiers for supply chain data.",
    ],
    numbers: {
      title: "Do I need to register a Code 128 barcode?",
      paragraphs: [
        "No. Code 128 holds whatever text you choose, so there's no number to license. Use your own SKUs, serial numbers or IDs.",
        "If a retailer or logistics partner asks for GS1 data (a GTIN, SSCC, batch or expiry date), use GS1-128 instead: it's Code 128 with GS1's structure.",
      ],
    },
    rules: [
      "Up to 80 characters of plain ASCII: letters, digits, spaces and the symbols on a US keyboard. Accented letters, emoji and control characters can't be encoded here.",
      "Code 128 adds its own check character (a sum modulo 103) and three code sets: set C packs two digits into each character, so long runs of digits make shorter barcodes. The encoder picks the code sets for you, and readers don't print the check character.",
    ],
    sizing: [
      "Each Code 128 character is 11 modules wide, plus start, check and stop characters and 10 modules of quiet zone each side. With the downloads' 0.353 mm module, ABCDEFGHIJ is 58.2 mm wide and 1234567890 is 38.8 mm: the digits pair up.",
      "A common rule for handheld scanners is bars at least 15% of the barcode's length, or 6.35 mm (a quarter inch), whichever is more. The default bar height is 15 mm.",
      "There's no fixed size: shrink the module for small labels, but test with the scanners that will read it, especially on thermal label printers.",
    ],
    faqs: [
      {
        question: "Can Code 128 hold lowercase letters?",
        answer:
          "Yes. Unlike Code 39, it encodes upper and lower case, digits and symbols.",
      },
      {
        question: "Why is my barcode so long?",
        answer:
          "Long text makes long barcodes: each letter adds 11 modules. Shorten the text, use digits where you can (they pair up), or use a 2D code such as Data Matrix, which holds far more in a small square.",
      },
      {
        question: "Is Code 128 the same as GS1-128?",
        answer:
          "GS1-128 is Code 128 with a special first character (FNC1) and GS1 Application Identifiers. A plain Code 128 with GS1-looking text isn't a GS1-128, and GS1 systems won't treat it as one.",
      },
    ],
  },
  {
    id: "itf14",
    slug: "itf-14",
    title: "Free ITF-14 Barcode Generator for Cartons",
    metaDescription:
      "Make an ITF-14 barcode for shipping cartons: 13 digits get the check digit, 14 are checked. Bearer bars included. SVG, PDF and EPS for print. Free.",
    intro:
      "ITF-14 is the barcode printed on corrugated cartons that hold retail products. It carries the 14-digit GTIN of the case. Type 13 digits and the check digit is added, or all 14 to have it checked, and download a vector with its bearer bars for your carton artwork.",
    usedFor: [
      "Outer cases and shipping cartons scanned in warehouses and distribution centers, not at the checkout. The thick frame around the bars (bearer bars) evens out printing pressure on rough board and stops a scanner reading only part of the barcode.",
      "The first digit is the indicator, 1 to 8, which tells packaging levels apart (a case of 6, a case of 24). The next 12 digits are the GTIN of the item inside without its check digit, and a new check digit closes the number.",
    ],
    numbers: {
      title: "Where does an ITF-14 number come from?",
      paragraphs: [
        "From the GTIN of the product inside. Take its 12-digit body (an EAN-13 without the check digit, or a UPC-A with a 0 in front), put an indicator digit before it and let the generator add the new check digit.",
        `So you need GS1 numbers for the product itself first. ${GS1_NUMBERS}`,
      ],
    },
    rules: [
      "Digits only; spaces and dashes are ignored. Thirteen digits get the check digit added, fourteen have it checked.",
      "The check digit uses the same 3, 1, 3, 1… weights from the right as EAN-13, over 13 digits.",
    ],
    sizing: [
      "GS1 sizes ITF-14 for cartons: a module of 0.495 mm to 1.016 mm (1.016 mm is 100%) and bars at least 32 mm high, with 10 modules of quiet zone each side.",
      "The downloads use a 0.353 mm module and 25 mm bars, smaller than GS1's minimum for cartons. Enlarge the file to 141% in your artwork: the module becomes 0.495 mm and the bars 35 mm.",
      "Printed straight onto brown board, bigger is safer: check the size with your packaging printer.",
    ],
    faqs: [
      {
        question: "Can I put an ITF-14 on a retail product?",
        answer:
          "No, it's for cases and cartons. The consumer unit inside carries its own EAN-13 or UPC-A for the checkout.",
      },
      {
        question: "What indicator digit should I use?",
        answer:
          "Any of 1 to 8, chosen by you, one per packaging configuration: for example 1 for a case of 6 and 2 for a case of 24. 9 is kept for items with variable quantity.",
      },
      {
        question: "Can I turn the bearer bars off?",
        answer:
          "Not here: the generator always draws the full frame, which GS1 recommends when ITF-14 is printed directly onto corrugated board.",
      },
    ],
  },
  {
    id: "gs1-128",
    slug: "gs1-128",
    title: "Free GS1-128 Barcode Generator (SSCC, Batch, Expiry)",
    metaDescription:
      "Make GS1-128 barcodes for logistics labels: GTIN, SSCC, batch, expiry and weight in one barcode. Check digits and dates checked. SVG, PDF and EPS. Free.",
    intro:
      "GS1-128 puts several pieces of supply chain data into one barcode, each marked by an Application Identifier (AI) in brackets: (01) for the GTIN, (17) for the expiry date, (10) for the batch, (00) for a pallet's SSCC. Type the AIs and values; check digits are added or checked for you.",
    usedFor: [
      "Logistics labels on cases and pallets, and labels on fresh food, meat and medical supplies where a batch, an expiry date or a weight must travel with the GTIN.",
      "The GS1 logistic label carries the pallet's SSCC, AI (00), as a GS1-128. Retail and logistics partners usually specify which AIs they want on it.",
    ],
    numbers: {
      title: "Do I need GS1 numbers for GS1-128?",
      paragraphs: [
        "For the GTIN in (01) and the SSCC in (00), yes: both are built from a GS1 company prefix. Batch numbers, dates and weights are your own data.",
        GS1_NUMBERS,
      ],
    },
    rules: [
      "Write each AI in brackets followed by its value: (01)09501101530003(17)261231(10)AB-123. The brackets aren't encoded; they show where each field starts.",
      "GTINs in (01) and (02) and SSCCs in (00) get their check digit added when you leave it off, or checked when you don't. The encoder also checks every value against GS1's rules: an unknown AI or an impossible date such as month 13 is refused.",
      "A GS1-128 holds up to 48 characters of AIs and data. Put variable-length fields such as (10) batch last, so no separator is needed after them.",
    ],
    sizing: [
      "On GS1 logistic labels, GS1 asks for a module of 0.495 mm to 0.94 mm (0.495 mm is the target), bars at least 31.75 mm high and a barcode no longer than 165 mm with its quiet zones.",
      "The downloads use a 0.353 mm module and 15 mm bars, which suits small item labels. For a pallet or case label, set the bar height to 23 mm and enlarge the file to 141%: the module becomes 0.495 mm and the bars 32.4 mm. The example is then 142 mm long.",
      "Long data makes long barcodes: if it won't fit in 165 mm, split it over two GS1-128 barcodes, as GS1 logistic labels do.",
    ],
    faqs: [
      {
        question: "What do (17) and (15) dates look like?",
        answer:
          "Six digits, YYMMDD: (17)261231 is an expiry of 31 December 2026. A day of 00 means the end of that month.",
      },
      {
        question: "Can I add a serial number?",
        answer:
          "Yes, with AI (21), up to 20 characters. Put it last, or after other fixed-length fields, to keep the barcode short.",
      },
      {
        question: "Why does my scanner show no brackets?",
        answer:
          "The brackets are only for people. Readers report the data with a symbology identifier (]C1) or none, and separate variable-length fields with an invisible GS character. The scan check here accepts all of these forms.",
      },
    ],
  },
  {
    id: "datamatrix",
    slug: "data-matrix",
    title: "Free Data Matrix Code Generator",
    metaDescription:
      "Make a Data Matrix code for part marking, small labels and serial numbers. Any text up to 1,000 characters, scan-checked in your browser. SVG, PDF and PNG.",
    intro:
      "Data Matrix is a small square 2D code that holds a lot of data in very little space. Type any text, up to 1,000 characters here, check that it scans and download it for parts, electronics, small labels and lab samples.",
    usedFor: [
      "Marking parts and electronics, sometimes etched straight onto metal, because a Data Matrix stays readable when part of it is damaged. Also small labels, lab tubes, documents and mail.",
      "Readers need a camera (an image-based scanner or a phone app), not a laser scanner. Many warehouse scanners read it, but some phone camera apps only read QR codes.",
    ],
    numbers: {
      title: "Plain Data Matrix or GS1 DataMatrix?",
      paragraphs: [
        "This page makes plain Data Matrix (ECC 200): it holds whatever text you type, with no registration.",
        "GS1 DataMatrix, required on some medicines and regulated packaging, adds a special first character and GS1 Application Identifiers. It isn't offered here; use GS1-128 if you need GS1 data in a barcode from this generator.",
      ],
    },
    rules: [
      "Any text, up to 1,000 characters here. The code grows in steps as you add text, from 10 × 10 cells upwards; this generator draws the square form.",
      "The largest square Data Matrix (144 × 144 cells) holds 3,116 digits, 2,335 letters and digits, or 1,556 bytes. Digits pack most tightly.",
    ],
    sizing: [
      "The vector downloads draw each cell 0.71 mm square, so SN-0042-7781 comes out 12.7 mm across with its margin. Scale it down in your layout for small labels.",
      "The smallest cell a scanner reads depends on the scanner and the print, so test at the size you'll use.",
      "Data Matrix needs only a 1-cell margin; the generator starts with 2.",
    ],
    faqs: [
      {
        question: "Can a phone read a Data Matrix?",
        answer:
          "Many barcode scanner apps can. Some phone camera apps only open QR codes, so if people scan with their phones, a QR code is the safer choice.",
      },
      {
        question: "Data Matrix or QR code?",
        answer:
          "For links people scan with a phone, QR. For small parts and industrial labels read by scanners, Data Matrix: it's more compact for short serial numbers and is the norm in electronics and part marking.",
      },
      {
        question: "Does it have error correction?",
        answer:
          "Yes. ECC 200 Data Matrix always includes Reed–Solomon error correction, so a scuffed or partly covered code can still be read.",
      },
    ],
  },
  {
    id: "ean8",
    slug: "ean-8",
    title: "Free EAN-8 Barcode Generator",
    metaDescription:
      "Make an EAN-8 barcode for packs too small for an EAN-13. Type 7 digits and the check digit is added, or 8 to have it checked. SVG, PDF, EPS and PNG.",
    intro:
      "EAN-8 is the short retail barcode for packs too small to fit an EAN-13, such as a lipstick or a pack of gum. Type 7 digits and the check digit is added, or all 8 to have it checked.",
    usedFor: [
      "Small retail items where an EAN-13 would cover too much of the pack. Checkout scanners read it like any EAN.",
      "EAN-8 numbers starting with 0 or 2 are kept for use inside a store or company, like EAN-13 numbers starting with 2.",
    ],
    numbers: {
      title: "Where do EAN-8 numbers come from?",
      paragraphs: [
        "From GS1, one at a time: GS1 organizations issue EAN-8 numbers (GTIN-8) individually, only for products that are too small for an EAN-13. You can't shorten an EAN-13 into one.",
        "Ask your GS1 organization whether your product qualifies; often a smaller EAN-13 at 80% fits.",
      ],
    },
    rules: [
      "Digits only. Seven digits get the check digit added, eight have it checked.",
      "The check digit weighs the 7 digits 3, 1, 3… from the right, as in every GS1 number.",
    ],
    sizing: [
      "At 100% an EAN-8 is 26.73 mm wide with its quiet zones, with a 0.33 mm module; GS1 allows 80% to 200%.",
      "The vector downloads use a 0.353 mm module, about 107%, with 7 modules of quiet zone each side, the minimum.",
    ],
    faqs: [
      {
        question: "Can I use an EAN-8 instead of an EAN-13 to save space?",
        answer:
          "Only with an EAN-8 number from GS1. Check first whether an EAN-13 at 80% fits your pack: it's only 29.83 mm wide.",
      },
      {
        question: "Is EAN-8 the same as UPC-E?",
        answer:
          "No. Both are short retail barcodes, but a UPC-E is a shortened UPC-A number, while an EAN-8 is a separate 8-digit number issued by GS1.",
      },
    ],
  },
  {
    id: "upce",
    slug: "upc-e",
    title: "Free UPC-E Barcode Generator",
    metaDescription:
      "Make a UPC-E barcode, the short UPC for small packs. Enter 6 to 8 digits, or a 12-digit UPC-A and see whether it can be shortened. SVG, PDF and PNG. Free.",
    intro:
      "UPC-E is a UPC-A number with its zeros squeezed out, for packs too small for a full UPC-A. Enter the 6 to 8 digits of a UPC-E, or paste a 12-digit UPC-A and the generator tells you whether it can be shortened.",
    usedFor: [
      "Small products sold in the US and Canada: cans, candy bars, cosmetics. Its bars take 51 modules, against 95 for a UPC-A.",
      "Scanners expand it back to the full UPC-A, so stores see the same number either way.",
    ],
    numbers: {
      title: "Can my UPC-A be shortened?",
      paragraphs: [
        "Only some can. The number must start with 0 or 1 and have zeros in the right places: a manufacturer number ending in 000, 100 or 200 with an item number of 00000 to 00999, ending in 00 with 00000 to 00099, ending in 0 with 00000 to 00009, or any manufacturer number with an item number of 00005 to 00009.",
        "The number itself comes from GS1, as for any UPC-A; GS1 US can tell you whether a UPC-E fits your prefix.",
      ],
    },
    rules: [
      "Enter 6 digits (number system 0 is assumed), 7 (number system and six digits; the check digit is added) or 8 (with the check digit, which is checked), or an 11- or 12-digit UPC-A to shorten.",
      "The check digit is the check digit of the expanded UPC-A, so the generator expands the number first.",
    ],
    sizing: [
      "UPC-E follows UPC-A's sizes: a 0.33 mm module at 100%, from 80% to 200%. Keep 9 modules clear on each side.",
      "The vector downloads use a 0.353 mm module, about 107%.",
    ],
    faqs: [
      {
        question: "Why does my scanner show 12 digits?",
        answer:
          "Many readers expand a UPC-E to its UPC-A, and some to the 13-digit EAN. The scan check on this page accepts all of them.",
      },
      {
        question: "My UPC-A can't be shortened. What now?",
        answer:
          "Print the UPC-A, at down to 80% if space is tight, or ask GS1 US for a number that has a UPC-E form.",
      },
    ],
  },
  {
    id: "code39",
    slug: "code-39",
    title: "Free Code 39 Barcode Generator",
    metaDescription:
      "Make a Code 39 barcode with capital letters, digits and - . $ / + %, up to 40 characters, for systems that require it. Scan-checked. SVG, PDF, PNG. Free.",
    intro:
      "Code 39 is an older barcode for capital letters, digits and a few symbols. Nearly every scanner reads it, and some industries and older systems still require it. Type up to 40 characters, check that it scans and download it.",
    usedFor: [
      "Labels in systems that specify it: older automotive and defence labels (LOGMARS), ID badges and legacy inventory systems.",
      "If nothing requires Code 39, use Code 128: it holds lowercase letters and makes a shorter barcode for the same text.",
    ],
    numbers: {
      title: "Do I need to register a Code 39 barcode?",
      paragraphs: [
        "No. Code 39 carries your own text: serial numbers, part numbers, IDs. There's nothing to license.",
      ],
    },
    rules: [
      "Capital letters A to Z, digits, spaces and - . $ / + %, up to 40 characters. Lowercase letters show an error: use capitals, or Code 128 for mixed case.",
      "Each code is wrapped in start and stop asterisks, which aren't typed or decoded. This generator adds no optional check character, which suits most systems; if yours requires a modulo 43 check, add it to your text yourself.",
    ],
    sizing: [
      "Each Code 39 character is 13 to 16 modules wide, against Code 128's 11, so the same text makes a wider barcode: ABCDEFGHIJ is 74.4 mm in the downloads, 58.2 mm as Code 128.",
      "Keep 10 modules of blank space each side, and make the bars at least 15% of the length, or 6.35 mm, so they're easy to sweep.",
    ],
    faqs: [
      {
        question: "Can Code 39 do lowercase?",
        answer:
          "Only in an extended mode (Full ASCII) that pairs characters, which this generator doesn't offer. Use Code 128 for lowercase.",
      },
      {
        question: "Should I type the asterisks?",
        answer:
          "No. The start and stop characters are added for you, and the asterisk can't be part of the text.",
      },
    ],
  },
  {
    id: "pdf417",
    slug: "pdf417",
    title: "Free PDF417 Barcode Generator",
    metaDescription:
      "Make a PDF417 barcode, the stacked 2D code on IDs and boarding passes. Any text up to 1,000 characters, scan-checked in your browser. SVG, PDF and PNG.",
    intro:
      "PDF417 is a stacked 2D barcode: rows of small barcodes on top of each other, holding up to about a kilobyte of text. Type your text, check that it scans and download it.",
    usedFor: [
      "Driver's licenses and ID cards (US and Canadian licenses carry one on the back), paper boarding passes, shipping documents and forms that carry their data with them.",
      "Its wide, short shape fits along the edge of a card or a label, where a square code wouldn't.",
    ],
    numbers: {
      title: "Do I need to register a PDF417 barcode?",
      paragraphs: [
        "No. It holds whatever text you type. Formats such as driver's license data follow their own standards for what goes inside; this generator encodes your text as given.",
      ],
    },
    rules: [
      "Any text, up to 1,000 characters here. A PDF417 has 3 to 90 rows of 1 to 30 data columns and can hold up to 1,850 letters and digits, 2,710 digits or 1,108 bytes.",
      "Error correction is built in, so part of the code can be damaged and still read.",
    ],
    sizing: [
      "The vector downloads use a 0.353 mm module: the sample text comes out 43.7 × 8.8 mm. Longer text adds rows and columns.",
      "Keep at least 2 modules of blank space around it; the generator starts there.",
    ],
    faqs: [
      {
        question: "Can phones read PDF417?",
        answer:
          "Many barcode scanner apps can, but the built-in camera apps often don't. It's mostly read by dedicated scanners, such as ID and boarding pass readers.",
      },
      {
        question: "Can I make a driver's license barcode?",
        answer:
          "Only an issuing authority makes real ones. This generator encodes text you type as a PDF417; it doesn't format license data.",
      },
    ],
  },
  {
    id: "aztec",
    slug: "aztec",
    title: "Free Aztec Code Generator",
    metaDescription:
      "Make an Aztec code, the 2D code on rail tickets and mobile boarding passes. No quiet zone needed. Any text up to 1,000 characters. SVG, PDF and PNG. Free.",
    intro:
      "Aztec is a square 2D code that scanners find from the bullseye in its center, so it needs no blank margin around it. Type any text, check that it scans and download it.",
    usedFor: [
      "Transport tickets, both printed at home and shown on phone screens: many European rail operators use it (the UIC 918-3 ticket standard specifies Aztec), and airlines use it on mobile boarding passes.",
      "Because it needs no quiet zone, it fits on tickets and screens where space around the code is tight.",
    ],
    numbers: {
      title: "Do I need to register an Aztec code?",
      paragraphs: [
        "No. It holds whatever text you type. Ticketing standards define their own data inside; this generator encodes your text as given.",
      ],
    },
    rules: [
      "Any text, up to 1,000 characters here. Aztec codes range from 15 × 15 cells (compact) to 151 × 151, holding up to 3,832 digits, 3,067 letters or 1,914 bytes.",
      "Error correction is built in, so a smudged or partly covered code can still be read.",
    ],
    sizing: [
      "The vector downloads draw each cell 0.71 mm square: the sample text comes out 19 mm across with a 2-cell margin. Scale it to suit your ticket or screen.",
      "No quiet zone is required, but a little white space helps scanners on busy designs.",
    ],
    faqs: [
      {
        question: "Aztec or QR code?",
        answer:
          "For links people scan with a phone camera, QR. Aztec is for ticketing and transport systems that ask for it.",
      },
      {
        question: "Can phones read Aztec codes?",
        answer:
          "Many scanner apps and ticket gates can. Some built-in camera apps only open QR codes.",
      },
    ],
  },
];

const bySlug = new Map(BARCODE_FORMAT_PAGES.map((page) => [page.slug, page]));
const byId = new Map(BARCODE_FORMAT_PAGES.map((page) => [page.id, page]));

export function getBarcodeFormatPage(
  slug: string,
): BarcodeFormatPage | undefined {
  return bySlug.get(slug);
}

/** /barcode-generator/<slug> for a format. */
export function barcodeFormatPath(id: BarcodeFormatId): string {
  const page = byId.get(id);
  if (!page) throw new Error(`No page for barcode format "${id}"`);
  return `/barcode-generator/${page.slug}`;
}
