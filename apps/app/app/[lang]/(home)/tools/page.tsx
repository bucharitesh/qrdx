import { MAX_BULK_TOOL_ROWS } from "@repo/config";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowRight,
  Barcode,
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
import { getTranslations } from "next-intl/server";
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
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import { QR_TYPES } from "@/lib/qr-types-content";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "tools.hub" });
  return localizedMetadata({
    locale,
    path: "/tools",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ownOgImage: true,
  });
}

type ToolKey =
  | "scanner"
  | "bulk"
  | "scanChecker"
  | "printSize"
  | "barcode"
  | "wifi"
  | "vcard"
  | "types"
  | "imageApi";

interface Tool {
  /** Its copy: tools.hub.items.<key>. */
  key: ToolKey;
  href: string;
  icon: CardIcon;
  /** Screenshot of the tool; tools with one are shown as large cards. */
  image?: Visual;
  /** object-position for the cropped thumbnail. */
  imagePosition?: string;
}

const tools: Tool[] = [
  { key: "scanner", href: "/scan", icon: Camera },
  {
    key: "bulk",
    href: "/tools/bulk",
    icon: TableDocument,
    image: productShots.bulkGenerator,
    imagePosition: "object-right-top",
  },
  {
    key: "scanChecker",
    href: "/tools/scan-checker",
    icon: Verify,
    image: productShots.scanChecker,
    imagePosition: "object-[50%_78%]",
  },
  {
    key: "printSize",
    href: "/tools/print-size",
    icon: Ruler,
    image: productShots.printSize,
    imagePosition: "object-left-top",
  },
  { key: "barcode", href: "/barcode-generator", icon: Barcode },
  {
    key: "wifi",
    href: "/qr-code-generator/wifi",
    icon: Wifi,
    image: productShots.wifiGenerator,
    imagePosition: "object-right-top",
  },
  { key: "vcard", href: "/qr-code-generator/vcard", icon: Personalcard },
  { key: "types", href: "/qr-code-generator", icon: Category },
  { key: "imageApi", href: "/docs/developers/image-api", icon: Code1 },
];

/** Counts in the copy come from code. */
const VALUES = {
  rows: MAX_BULK_TOOL_ROWS,
  count: PRODUCT_FACTS.barcodeFormats,
  types: QR_TYPES.length,
};

const featuredTools = tools.filter((tool) => tool.image);
const otherTools = tools.filter((tool) => !tool.image);

type ToolText = (tool: Tool) => { title: string; description: string };

function ToolCard({ tool, text }: { tool: Tool; text: ToolText }) {
  const { title, description } = text(tool);
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
            <span className="min-w-0 text-pretty">{title}</span>
            <ArrowRight
              aria-hidden
              className="mt-0.5 ml-auto size-3.5 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
            />
          </span>
          <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
            {description}
          </p>
        </div>
      </div>
    </SpotlightLink>
  );
}

export default async function ToolsPage() {
  const locale = await requireLocale();
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "tools.hub" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const text: ToolText = ({ key }) => {
    switch (key) {
      case "bulk":
        return {
          title: t("items.bulk.title"),
          description: t("items.bulk.description", { rows: VALUES.rows }),
        };
      case "barcode":
        return {
          title: t("items.barcode.title"),
          description: t("items.barcode.description", { count: VALUES.count }),
        };
      case "types":
        return {
          title: t("items.types.title", { count: VALUES.types }),
          description: t("items.types.description"),
        };
      default:
        return {
          title: t(`items.${key}.title`),
          description: t(`items.${key}.description`),
        };
    }
  };
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        crumbs={[
          { name: common("home"), path: "/" },
          { name: common("tools"), path: "/tools" },
        ]}
        title={t("title")}
        intro={[t("intro")]}
      />

      <section
        aria-label={t("listLabel")}
        className="w-full px-10 py-10 flex flex-col gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {featuredTools.map((tool) => (
            <ToolCard key={tool.href} tool={tool} text={text} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {otherTools.map((tool) => (
            <ToolCard key={tool.href} tool={tool} text={text} />
          ))}
        </div>
      </section>
    </main>
  );
}
