import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowRight,
  Camera,
  Category,
  Code1,
  Personalcard,
  Ruler,
  TableDocument,
  Verify,
  Wifi,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { MockupImage } from "@/components/mockups/mockup-image";
import { productShots, type Visual } from "@/components/mockups/visuals";
import {
  type CardIcon,
  cardClass,
  IconTile,
  interactiveCardClass,
} from "@/components/sections/tools/cards";
import { SpotlightLink } from "@/components/sections/tools/spotlight-link";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { createMetadata } from "@/lib/metadata";
import { QR_TYPES } from "@/lib/qr-types-content";

export const metadata: Metadata = createMetadata({
  title: "Free QR Code Tools",
  description:
    "Free QR code tools: bulk generator from CSV, scan checker, print size calculator, Wi-Fi and vCard generators, and a QR image API for developers.",
  path: "/tools",
});

interface Tool {
  href: string;
  title: string;
  description: string;
  icon: CardIcon;
  /** Screenshot of the tool; tools with one are shown as large cards. */
  image?: Visual;
  /** object-position for the cropped thumbnail. */
  imagePosition?: string;
}

const tools: Tool[] = [
  {
    href: "/scan",
    title: "QR code scanner",
    description:
      "Scan QR codes and barcodes with your camera or an image, with a safe-link preview before you open anything.",
    icon: Camera,
  },
  {
    href: "/tools/bulk",
    title: "Bulk QR code generator",
    description:
      "Upload a CSV and download up to 5,000 styled codes as PNG or SVG in one ZIP, generated in your browser.",
    icon: TableDocument,
    image: productShots.bulkGenerator,
    imagePosition: "object-right-top",
  },
  {
    href: "/tools/scan-checker",
    title: "QR code scan checker",
    description:
      "Upload an image of a QR code to decode it and check how reliably it scans.",
    icon: Verify,
    image: productShots.scanChecker,
    imagePosition: "object-[50%_78%]",
  },
  {
    href: "/tools/print-size",
    title: "Print size calculator",
    description:
      "Work out the minimum printed size from scanning distance, data length and error correction.",
    icon: Ruler,
    image: productShots.printSize,
    imagePosition: "object-left-top",
  },
  {
    href: "/qr-code-generator/wifi",
    title: "Wi-Fi QR code generator",
    description:
      "Let guests join your network with one scan instead of typing the password.",
    icon: Wifi,
    image: productShots.wifiGenerator,
    imagePosition: "object-right-top",
  },
  {
    href: "/qr-code-generator/vcard",
    title: "vCard QR code generator",
    description:
      "Put your contact details on a business card that saves straight to the phone.",
    icon: Personalcard,
  },
  {
    href: "/qr-code-generator",
    title: `All ${QR_TYPES.length} QR code types`,
    description:
      "Generators for WhatsApp, UPI, email, SMS, social profiles, payments and more.",
    icon: Category,
  },
  {
    href: "/docs/developers/image-api",
    title: "QR code image API",
    description:
      "Get a QR code image from a URL for READMEs, emails and HTML, with no API key.",
    icon: Code1,
  },
];

const featuredTools = tools.filter((tool) => tool.image);
const otherTools = tools.filter((tool) => !tool.image);

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <SpotlightLink
      href={tool.href}
      className={cn(
        cardClass,
        interactiveCardClass,
        "flex h-full min-w-0 flex-col overflow-hidden",
      )}
    >
      {tool.image && (
        <div className="aspect-[16/8] overflow-hidden border-b border-border bg-muted/30">
          <MockupImage
            {...tool.image}
            bare
            sizes="(min-width: 1280px) 600px, (min-width: 640px) 50vw, 100vw"
            className={cn("h-full object-cover", tool.imagePosition)}
          />
        </div>
      )}
      <div className="flex flex-1 items-start gap-3.5 p-4 sm:p-5">
        <IconTile icon={tool.icon} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-start gap-2 font-medium leading-snug text-foreground">
            <span className="min-w-0 text-pretty">{tool.title}</span>
            <ArrowRight
              aria-hidden
              className="mt-0.5 ml-auto size-3.5 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
            />
          </span>
          <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
            {tool.description}
          </p>
        </div>
      </div>
    </SpotlightLink>
  );
}

export default function ToolsPage() {
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Tools", path: "/tools" },
        ]}
        title="Free QR code tools"
        intro={[
          "Small, focused tools for the jobs around a QR code: making many at once, sizing them for print and checking that they scan. They are free, need no account and run in your browser.",
        ]}
      />

      <section
        aria-label="Tools"
        className="w-full px-6 md:px-10 py-10 flex flex-col gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {featuredTools.map((tool) => (
            <ToolCard key={tool.href} tool={tool} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {otherTools.map((tool) => (
            <ToolCard key={tool.href} tool={tool} />
          ))}
        </div>
      </section>
    </main>
  );
}
