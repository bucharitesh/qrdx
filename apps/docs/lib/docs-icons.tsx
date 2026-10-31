import { Bot } from "@repo/design-system/components/icons";
import {
  Book1,
  Category,
  ClipboardText,
  Code,
  Code1,
  ColorSwatch,
  DocumentCode,
  Driver,
  Element2,
  Element4,
  Flash,
  FolderOpen,
  Gallery,
  GalleryImport,
  Global,
  Gps,
  Grid1,
  type Icon,
  Import,
  Lock1,
  MagicStar,
  MouseCircle,
  Notification,
  PictureFrame,
  Profile2User,
  Routing,
  Scan,
  ScanBarcode,
  Setting2,
  Share,
  Speedometer,
} from "iconsax-reactjs";
import { createElement } from "react";

/**
 * Icons for docs content. Keys are the names used in `icon:` frontmatter,
 * meta.json files and `<Card icon={<Name />}>` in MDX, so content keeps its
 * readable names while everything renders from iconsax.
 */
export const docsIcons = {
  Bell: Notification,
  Blocks: Category,
  Book: Book1,
  Bot,
  ClipboardList: ClipboardText,
  Code,
  Download: Import,
  FileCode: DocumentCode,
  FolderOpen,
  Frame: PictureFrame,
  Gauge: Speedometer,
  Globe: Global,
  Grid3x3: Grid1,
  Image: Gallery,
  ImageDown: GalleryImport,
  LayoutTemplate: Element4,
  LockKeyhole: Lock1,
  MousePointerClick: MouseCircle,
  Palette: ColorSwatch,
  PanelsTopLeft: Element2,
  QrCode: ScanBarcode,
  Rocket: Flash,
  Scan,
  Server: Driver,
  Sparkles: MagicStar,
  Split: Routing,
  Target: Gps,
  Terminal: Code1,
  Users: Profile2User,
  Webhook: Share,
  Wrench: Setting2,
} satisfies Record<string, Icon | typeof Bot>;

/** Page-tree icon resolver for the fumadocs loader. */
export function resolveDocsIcon(name: string | undefined) {
  if (!name) return;
  const Component = docsIcons[name as keyof typeof docsIcons];
  if (!Component) {
    console.warn(`[docs-icons] Unknown icon: ${name}`);
    return;
  }
  return createElement(Component);
}
