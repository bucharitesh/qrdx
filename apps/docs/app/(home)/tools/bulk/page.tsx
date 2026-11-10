import type { Metadata } from "next";
import { BrowserFrame } from "@/components/mockups/browser-frame";
import { LoopVideo } from "@/components/mockups/loop-video";
import { loopVideos } from "@/components/mockups/visuals";
import { BulkGenerator } from "@/components/sections/tools/bulk-generator";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { formatCount, MAX_BULK_TOOL_ROWS } from "@/lib/bulk-limits";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Free Bulk QR Code Generator from CSV",
  description: `Generate up to ${formatCount(MAX_BULK_TOOL_ROWS)} QR codes from a CSV file and download them as PNG or SVG, zipped. Custom styles and file names. Runs entirely in your browser.`,
  path: "/tools/bulk",
  ownOgImage: true,
});

const steps = [
  {
    title: "Prepare a CSV",
    body: "One row per QR code. Put the content (a link, Wi-Fi string, phone number or any text) in one column and, optionally, the file name you want in another. Download the sample CSV to see the layout.",
  },
  {
    title: "Map the columns",
    body: "Pick which column holds the QR content and which one names the files. Without a file-name column, codes are numbered qr-0001, qr-0002 and so on, in row order.",
  },
  {
    title: "Pick a style and format",
    body: "Choose a built-in preset, the style you last used in the editor, or one of your saved themes when you're signed in. SVG is best for print; PNG for screens and documents.",
  },
  {
    title: "Generate and download",
    body: "Codes are rendered a few at a time with a progress bar and go into the ZIP as they're made. A very large batch is saved as several ZIP files of about 500 MB. Rows that can't be encoded are skipped and listed in errors.csv.",
  },
];

const faqs = [
  {
    question: "Is my CSV uploaded anywhere?",
    answer:
      "No. The file is read, the QR codes are drawn and the ZIP is built in your browser. Nothing is sent to QRdx's servers, so it's safe for internal links, Wi-Fi passwords or customer data.",
  },
  {
    question: "How many QR codes can I generate at once?",
    answer: `Up to ${formatCount(MAX_BULK_TOOL_ROWS)} rows per file; for more, split the CSV, or use the qrdx batch command of the CLI, which has no limit. A 512 px PNG takes about 20 ms on a laptop, so the full ${formatCount(MAX_BULK_TOOL_ROWS)} take a few minutes. Bigger PNGs take longer and make bigger files, so choose 512 px unless you need more.`,
  },
  {
    question: "What can each row contain?",
    answer:
      "Any text up to the QR code limit: links, plain text, or payloads such as WIFI:..., mailto:..., tel:... and BEGIN:VCARD. The content is encoded exactly as it appears in the cell.",
  },
  {
    question: "Are the generated codes static or dynamic?",
    answer:
      "Static. Each code contains its row's content directly, works offline, never expires and can't be edited after printing. For editable codes with scan statistics, create dynamic codes from your QRdx dashboard.",
  },
  {
    question: "What happens with duplicate or invalid file names?",
    answer:
      "Characters that aren't allowed in file names are replaced with a hyphen, and duplicate names get a number suffix (menu.png, menu-2.png) so no file is overwritten.",
  },
];

export default function BulkPage() {
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="rain"
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Tools", path: "/tools" },
          { name: "Bulk generator", path: "/tools/bulk" },
        ]}
        title="Bulk QR code generator"
        intro={[
          "Turn a spreadsheet into hundreds or thousands of QR codes in one go: product labels, event tickets, asset tags, table numbers or personalised mailers. Upload a CSV, map the columns, choose a style and download every code as PNG or SVG, zipped.",
          "Everything happens in your browser. The CSV is never uploaded and there is no sign-up, watermark or per-code charge.",
        ]}
      />

      <section
        aria-label="Bulk QR code generator"
        className="w-full px-10 py-10"
      >
        <BulkGenerator />
      </section>

      <section className="w-full px-10 py-10 flex flex-col gap-6">
        <h2 className="text-2xl font-medium tracking-tighter">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <span className="grid size-7 place-items-center rounded-md border bg-muted/40 font-mono text-xs text-foreground/80">
                {index + 1}
              </span>
              <h3 className="mt-1 font-medium">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
        <BrowserFrame
          url="qrdx.dev/tools/bulk"
          className="mx-auto w-full max-w-4xl"
        >
          <LoopVideo {...loopVideos.bulk} />
        </BrowserFrame>
      </section>

      <FaqList title="Bulk QR code FAQ" faqs={faqs} />
    </main>
  );
}
