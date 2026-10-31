import type { Metadata } from "next";
import Link from "next/link";
import { BrowserFrame } from "@/components/mockups/browser-frame";
import { LoopVideo } from "@/components/mockups/loop-video";
import { loopVideos } from "@/components/mockups/visuals";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { createMetadata } from "@/lib/metadata";
import { ScanChecker } from "./scan-checker";

export const metadata: Metadata = createMetadata({
  title: "QR Code Scan Checker",
  description:
    "Upload or paste a picture of any QR code to read what it says and test how reliably it scans: small sizes, camera blur, contrast and clear space. Runs in your browser; nothing is uploaded.",
  path: "/tools/scan-checker",
});

const faqs = [
  {
    question: "Is my image uploaded anywhere?",
    answer:
      "No. The checker runs entirely in your browser with JavaScript. The image is read on your device and never sent to a server.",
  },
  {
    question: "How is the scan score calculated?",
    answer:
      "The checker finds the code with the open-source jsQR decoder, shrinks it to 96, 160 and 320 pixels wide, adds camera-like blur and contrast loss, and tries to decode it a few times at each size. It then measures the contrast between dark and light modules, whether the code is dark on light, the clear space around it and the image resolution. Each problem lowers the score from 100.",
  },
  {
    question: "My code scores low but scans on my phone. Why?",
    answer:
      "Phone camera apps are often more forgiving than jsQR, and a photo can lose contrast or sharpness that the printed code doesn't. Treat a low score as a warning that weaker scanners, smaller prints or poor lighting may fail, and test-scan with a few phones before a big print run.",
  },
  {
    question: "How big should a printed QR code be?",
    answer:
      "A common rule of thumb is width ≈ scanning distance ÷ 10, so a code scanned from 20 cm should be about 2 cm wide. Codes holding more data need to be bigger; the print size calculator works it out for you.",
  },
  {
    question: "How do I fix a low score?",
    answer:
      "Use a dark code on a light background with strong contrast, keep clear space around the code, pick simple square or rounded eyes, choose a higher error-correction level if there is a logo, shorten the content, or print it bigger.",
  },
];

export default function ScanCheckerPage() {
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Tools", path: "/tools" },
          { name: "Scan checker", path: "/tools/scan-checker" },
        ]}
        title="QR code scan checker"
        intro={[
          "Will it scan? Upload, drop or paste a screenshot or photo of any QR code to see what it contains and how reliably it reads, before it goes on a menu, poster or package.",
          "The checker decodes the code, then shrinks and blurs it the way a phone camera would and tests it again at several sizes, with checks for contrast, clear space and resolution. Everything happens in your browser.",
        ]}
      />

      <section
        aria-label="QR code scan checker"
        className="w-full px-6 md:px-10 py-10"
      >
        <ScanChecker />
      </section>

      <section className="w-full px-6 md:px-10 py-10 grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            What the checker tests
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            <li>
              Decoding at 96, 160 and 320 pixels wide with simulated camera
              blur: roughly a small or distant print, normal phone distance and
              a close-up.
            </li>
            <li>
              Contrast between the dark and light modules, measured from the
              image pixels.
            </li>
            <li>
              Polarity: light codes on dark backgrounds are not read by every
              scanner app.
            </li>
            <li>
              Clear space (the quiet zone) around the code, when the image shows
              it.
            </li>
            <li>Image resolution: how many pixels each module gets.</li>
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            Designing a new code?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The{" "}
            <Link href="/playground" className="underline">
              QRdx editor
            </Link>{" "}
            shows a live scan score while you design, flags risky eye shapes and
            oversized logos, and exports print-ready vector PDFs. Use the{" "}
            <Link href="/tools/print-size" className="underline">
              print size calculator
            </Link>{" "}
            to choose how big to print it.
          </p>
          <BrowserFrame url="qrdx.dev/tools/scan-checker" className="mt-3">
            <LoopVideo {...loopVideos.scanChecker} />
          </BrowserFrame>
        </div>
      </section>

      <FaqList title="Scan checker FAQ" faqs={faqs} />
    </main>
  );
}
