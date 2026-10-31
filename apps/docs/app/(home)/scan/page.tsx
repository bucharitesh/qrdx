import type { Metadata } from "next";
import Link from "next/link";
import { RegisterScannerServiceWorker } from "@/components/scanner/register-sw";
import { Scanner } from "@/components/scanner/scanner";
import { FaqList } from "@/components/sections/tools/faq-list";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { baseUrl, createMetadata } from "@/lib/metadata";
import { isWebRiskConfigured } from "@/lib/safety/web-risk";

export const metadata: Metadata = createMetadata({
  title: "QR Code Scanner Online",
  description:
    "Free online QR code and barcode scanner. Scan with your camera or from an image, see where a link really goes before it opens, and keep your history on your device. No app, no signup.",
  path: "/scan",
  manifest: "/scan/manifest.webmanifest",
});

const FORMATS = [
  "QR code",
  "Data Matrix",
  "Aztec",
  "PDF417",
  "EAN-13 and EAN-8",
  "UPC-A and UPC-E",
  "Code 128",
  "Code 39",
];

const CONTENT_TYPES: { name: string; detail: string }[] = [
  {
    name: "Links",
    detail: "a safety preview first; opens only when you tap Open",
  },
  { name: "Wi-Fi", detail: "network name, security and a copyable password" },
  { name: "Contacts (vCard, MeCard)", detail: "save straight to a .vcf file" },
  { name: "Calendar events", detail: "add to your calendar as an .ics file" },
  { name: "Locations", detail: "open in Google Maps or OpenStreetMap" },
  { name: "Phone, SMS and email", detail: "start a call, text or email" },
  {
    name: "Payments",
    detail:
      "UPI, Bitcoin, Ethereum, PayPal, Venmo and SEPA (EPC) codes, always with a confirm step",
  },
  {
    name: "Product codes",
    detail:
      "EAN/UPC numbers and GS1 data (GTIN, batch, expiry), including GS1 Digital Link",
  },
  { name: "Plain text", detail: "read and copy" },
];

function faqs(webRisk: boolean) {
  return [
    {
      question: "How do I scan a QR code online?",
      answer:
        "Open this page, tap Start camera and allow camera access, then point your camera at the code. On a laptop or when the code is already on your screen, switch to Image and upload, drag in or paste a screenshot. The result appears under the scanner. Links never open until you tap Open.",
    },
    {
      question: "Is it safe to open a link from a QR code?",
      answer: `Usually, but fake QR codes stuck over real ones ("quishing") are a common scam. Before you open a link, the scanner follows its redirects (up to five) to show where it really ends up${
        webRisk ? ", checks each address with Google Web Risk" : ""
      } and looks for common tricks: lookalike letters from other alphabets, bare IP addresses, link shorteners, a fake site name hidden before an @, brand names on unrelated domains, unencrypted pages and app downloads. No check catches everything, so still be careful with sign-in and payment pages.`,
    },
    {
      question: 'What does "Verified QRdx code" mean?',
      answer:
        "The link is a real, active dynamic QR code created with QRdx (a qrdx.dev/q/ link or a verified custom domain) and has no open abuse reports. It tells you the code is genuine and hasn't been switched off; the code's owner still decides where it points, so the other safety checks still apply.",
    },
    {
      question: "Are my scans uploaded or saved?",
      answer: `No. Camera frames and images are decoded in your browser and never leave your device. Your scan history is stored only in this browser (IndexedDB); you can turn it off, delete single scans or clear it all. To preview a link, only that address is sent to QRdx${
        webRisk ? " and Google Web Risk" : ""
      }, and QRdx doesn't keep it. What you scan is kept out of site analytics.`,
    },
    {
      question: "Why can't the scanner join a Wi-Fi network for me?",
      answer:
        "Web browsers aren't allowed to change your device's Wi-Fi settings. The scanner shows the network name and lets you copy the password, so you can paste it in your Wi-Fi settings. Your phone's built-in camera app can usually join a Wi-Fi QR code directly.",
    },
    {
      question: "Can I scan many codes in a row?",
      answer:
        "Yes. Turn on Batch mode and keep pointing the camera at codes, or add several images at once. Each new code is added to the list once, and you can export the batch, or your whole history, as a CSV file.",
    },
    {
      question: "Does it work offline?",
      answer:
        "Once you've scanned with it, your browser keeps the scanner page and its decoder, so it opens and reads codes without a connection. Link safety checks need a connection, and links found offline can be checked later from your history.",
    },
    {
      question: "Which browsers are supported?",
      answer:
        "Any modern browser with camera access: Chrome, Edge, Safari and Firefox on phones and computers. Browsers with a built-in barcode reader (Chrome on Android and macOS) use it directly; others download an open-source decoder (ZXing, compiled to WebAssembly, about 1 MB from the jsDelivr CDN) the first time you scan. The camera needs an https page and your permission.",
    },
    {
      question: "Can I install the scanner as an app?",
      answer:
        "Yes. Use your browser's Install or Add to Home Screen option on this page to get a scanner icon that opens straight to the camera.",
    },
  ];
}

export default function ScanPage() {
  const webRisk = isWebRiskConfigured();
  const pageUrl = new URL("/scan", baseUrl).toString();

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "QRdx QR code scanner",
          url: pageUrl,
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Any (web browser)",
          browserRequirements: "Requires a camera for live scanning",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList: [
            "Scan QR codes and barcodes with the camera",
            "Scan codes in uploaded, dropped or pasted images",
            "Safe-link preview with redirect chain",
            "Batch scanning with CSV export",
            "On-device scan history",
          ],
        }}
      />
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Tools", path: "/tools" },
          { name: "QR code scanner", path: "/scan" },
        ]}
        title="QR code scanner online"
        intro={[
          "Scan QR codes and barcodes with your phone or laptop camera, or from a screenshot or photo. Free, with no app and no signup.",
          `Links get a safety preview before anything opens: the scanner shows where the link really ends up${
            webRisk ? ", checks it with Google Web Risk" : ""
          } and flags common phishing tricks. Codes are decoded on your device, and your history stays in this browser.`,
        ]}
      />

      <section
        aria-label="QR code scanner"
        className="w-full px-6 md:px-10 py-10"
      >
        <Scanner />
        <RegisterScannerServiceWorker />
      </section>

      <section className="w-full px-6 md:px-10 py-10 grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            What it reads
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Barcode formats: {FORMATS.join(", ")}. Several codes in one frame or
            image are read together.
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            {CONTENT_TYPES.map((type) => (
              <li key={type.name}>
                <span className="text-foreground font-medium">{type.name}</span>
                : {type.detail}.
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            A safety preview for every link
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            <li>
              The link is shown first, with its domain highlighted. Nothing
              opens on its own.
            </li>
            <li>
              QRdx follows the redirects from its server (up to five, without
              downloading the pages) and shows where the link ends up.
            </li>
            <li>
              {webRisk
                ? "Each address is checked with Google Web Risk for phishing and malware, and against common tricks"
                : "Each address is checked against common tricks"}
              : lookalike letters, IP addresses, shorteners, hidden user names,
              brand names on unrelated domains, unencrypted pages and app
              downloads.
            </li>
            <li>
              Genuine, active QRdx codes get a Verified QRdx code badge.
              Password-protected codes keep their destination hidden.
            </li>
            <li>
              Spotted a scam? Use{" "}
              <Link href="/report-abuse" className="underline">
                Report this code
              </Link>{" "}
              on the result.
            </li>
          </ol>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Making codes instead? Use the{" "}
            <Link href="/qr-code-generator" className="underline">
              QR code generators
            </Link>{" "}
            or the{" "}
            <Link href="/playground" className="underline">
              editor
            </Link>
            , and test a design with the{" "}
            <Link href="/tools/scan-checker" className="underline">
              scan checker
            </Link>{" "}
            before you print.
          </p>
        </div>
      </section>

      <FaqList title="QR code scanner FAQ" faqs={faqs(webRisk)} />
    </main>
  );
}
