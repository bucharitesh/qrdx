import { getBlock, parseLandingPageContent } from "@/lib/landing/blocks";
import {
  buildTemplateContent,
  getTemplate,
  listTemplates,
  type PageTemplate,
  type PageTemplateVariant,
} from "@/lib/landing/templates";
import { mediaUrl } from "@/lib/media";
import { baseUrl } from "@/lib/metadata";
import type { LandingPageContent } from "@/types/landing";
import { demoPath } from "./demo-paths";
import { smallTemplatePhoto, templateMediaUrl } from "./templates/media";

// Public template demos (/templates and /templates/<type>/<id>): each
// template's own content, plus sample media wherever the template leaves a
// file for the owner to add. On a published page an empty PDF, gallery or
// audio block shows nothing, so a demo without samples would look broken.
// Built in memory from the registry; nothing is read from or written to the
// database.

type Props = Record<string, unknown>;

/** A sample photo from public/images/templates (half size in thumbnails). */
const photo = (name: string, thumbnail: boolean) => ({
  type: "url" as const,
  url: templateMediaUrl(`${name}${thumbnail ? ".sm" : ""}.webp`),
});

/** Files in public/samples (sample PDFs and short synthesized clips). */
const sampleFile = (name: string) => ({
  type: "url" as const,
  url: new URL(`/samples/${name}`, baseUrl).toString(),
});

/** CC0 clip from MDN's media examples, served from our R2 bucket. */
const SAMPLE_VIDEO = {
  type: "url" as const,
  url: mediaUrl("/videos/demo/flower.mp4"),
};

/** Stand-in for the owner's own review link (like the templates' other links). */
const SAMPLE_REVIEW_URL = "https://example.com/review";

interface SamplePhoto {
  name: string;
  alt: string;
}

const SUMMER: SamplePhoto[] = [
  { name: "photo-sunglasses", alt: "Sunglasses and wildflowers" },
  { name: "photo-meadow", alt: "Walking through a sunny meadow" },
  { name: "photo-raspberries", alt: "Raspberries in warm light" },
  { name: "photo-orange-tree", alt: "Oranges on the tree" },
];

/** Gallery photos by "<type>/<template id>"; others use SUMMER. */
const GALLERIES: Record<string, SamplePhoto[]> = {
  "images/gallery": SUMMER,
  "images/portfolio": [
    { name: "photo-towers", alt: "Two towers from below" },
    { name: "photo-facade", alt: "A grid of windows" },
    { name: "photo-tower-lines", alt: "A tower's ribbed facade" },
    { name: "photo-angles", alt: "A sharp building corner" },
    { name: "photo-flatiron", alt: "A narrow corner building" },
    { name: "photo-glass-tower", alt: "A glass tower in the mist" },
  ],
  "images/event-photos": [
    { name: "photo-band", alt: "The band on stage" },
    { name: "photo-lights", alt: "Stage lights over the crowd" },
    { name: "photo-crowd", alt: "Hands up in the crowd" },
  ],
};

interface SampleAudio {
  cover?: string;
  tracks: string[];
}

/** Audio by "<type>/<template id>"; others get one sample track. */
const AUDIO: Record<string, SampleAudio> = {
  "mp3/album": {
    cover: "cover-city-dusk",
    tracks: ["Headlights", "Neon rain", "Last exit"],
  },
  "mp3/podcast": {
    cover: "cover-shop",
    tracks: ["Ep. 12: Opening a second shop", "Ep. 11: Pricing for regulars"],
  },
  "mp3/voice-message": {
    cover: "cover-water-lily",
    tracks: ["From all of us at home"],
  },
};

/** Sample PDF by "<type>/<template id>". */
const PDFS: Record<string, string> = {
  "pdf/document": "product-guide.pdf",
  "pdf/menu": "restaurant-menu.pdf",
  "pdf/brochure": "apartment-brochure.pdf",
};

const isEmpty = (value: unknown) => !Array.isArray(value) || value.length === 0;

/** Props to merge over a block that needs owner media, or null to keep it. */
const SAMPLES: Record<
  string,
  (props: Props, key: string, thumbnail: boolean) => Props | null
> = {
  pdf: (props, key) =>
    props.source
      ? null
      : { source: sampleFile(PDFS[key] ?? "product-guide.pdf") },
  gallery: (props, key, thumbnail) => {
    if (!isEmpty(props.images)) return null;
    return {
      images: (GALLERIES[key] ?? SUMMER).map(({ name, alt }) => ({
        source: photo(name, thumbnail),
        alt,
      })),
    };
  },
  audio: (props, key, thumbnail) => {
    if (!isEmpty(props.tracks)) return null;
    const audio = AUDIO[key] ?? { tracks: ["Sample track"] };
    return {
      ...(audio.cover &&
        !props.cover && { cover: photo(audio.cover, thumbnail) }),
      tracks: audio.tracks.map((title, index) => ({
        source: sampleFile(`demo-track-${(index % 3) + 1}.mp3`),
        title,
      })),
    };
  },
  "video-file": (props) => (props.source ? null : { source: SAMPLE_VIDEO }),
  "file-download": (props, key) => {
    if (!isEmpty(props.files)) return null;
    const gallery = GALLERIES[key];
    if (gallery) {
      return {
        files: gallery.slice(0, 2).map(({ name, alt }) => ({
          source: photo(name, false),
          label: `${alt} (full size)`,
          kind: "image",
        })),
      };
    }
    return {
      files: [
        {
          source: sampleFile("product-guide.pdf"),
          label: "Sample file",
          kind: "pdf",
        },
      ],
    };
  },
  "review-links": (props) => {
    const links = Array.isArray(props.links) ? (props.links as Props[]) : [];
    if (links.every((link) => link.url)) return null;
    return {
      links: links.map((link) =>
        link.url ? link : { ...link, url: SAMPLE_REVIEW_URL },
      ),
    };
  },
};

/** Blocks a thumbnail renders (it shows about one phone screen). */
const THUMBNAIL_BLOCKS = 4;

/** A long menu cut to what fits on one screen, for thumbnails. */
function firstScreen(type: string, props: Props): Props {
  if (type !== "menu" || !Array.isArray(props.sections)) return props;
  return {
    ...props,
    sections: (props.sections as Props[]).slice(0, 2).map((section) => ({
      ...section,
      items: Array.isArray(section.items) ? section.items.slice(0, 4) : [],
    })),
  };
}

/** Every template photo in `value` swapped for its half-size copy. */
function withSmallPhotos<T>(value: T): T {
  if (typeof value === "string") return smallTemplatePhoto(value) as T;
  if (Array.isArray(value)) return value.map(withSmallPhotos) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withSmallPhotos(item)]),
    ) as T;
  }
  return value;
}

export interface TemplateDemo {
  template: PageTemplate;
  variant: PageTemplateVariant;
  /** /templates/<type>/<template id> */
  path: string;
}

/** Every template of every page type, in picker order. */
export function listTemplateDemos(): TemplateDemo[] {
  return listTemplates().flatMap((template) =>
    template.variants.map((variant) => ({
      template,
      variant,
      path: demoPath(template.type, variant.id),
    })),
  );
}

export function getTemplateDemo(
  type: string,
  variantId: string,
): TemplateDemo | null {
  const template = getTemplate(type);
  const variant = template?.variants.find((item) => item.id === variantId);
  return template && variant
    ? { template, variant, path: demoPath(type, variantId) }
    : null;
}

/**
 * The template's default content with sample media filled in and stable
 * block ids. Throws for unknown templates (like buildTemplateContent).
 */
export function buildDemoContent(
  type: string,
  variantId: string,
  { thumbnail = false }: { thumbnail?: boolean } = {},
): LandingPageContent {
  const content = buildTemplateContent(type, variantId);
  const key = `${type}/${variantId}`;
  const blocks = content.blocks.map((block, index) => {
    // Unique within the page and across gallery thumbnails (DOM ids derive from it).
    const id = `b${index + 1}-${type}-${variantId}`.slice(0, 64);
    const patch = SAMPLES[block.type]?.(block.props, key, thumbnail);
    const definition = getBlock(block.type);
    const props =
      patch && definition
        ? (definition.schema.parse({ ...block.props, ...patch }) as Props)
        : block.props;
    return {
      ...block,
      id,
      props: thumbnail
        ? withSmallPhotos(firstScreen(block.type, props))
        : props,
    };
  });
  const parsed = parseLandingPageContent({
    ...content,
    theme: thumbnail ? withSmallPhotos(content.theme) : content.theme,
    // A thumbnail shows about one phone screen: skip what can't be seen.
    blocks: thumbnail ? blocks.slice(0, THUMBNAIL_BLOCKS) : blocks,
  });
  if (!parsed.success) {
    throw new Error(
      `Template demo "${key}" is invalid: ${parsed.error.issues[0]?.message}`,
    );
  }
  return parsed.data;
}

/**
 * The page type as a phrase for "<type> page" copy: "Link list" → "link
 * list", "vCard Plus" and "PDF" stay as they are, "Custom page" → "custom".
 */
export function pageTypePhrase(label: string): string {
  const base = label.replace(/\s+page$/i, "");
  const keepCase = /^[a-z]/.test(base) || /^.[A-Z]/.test(base);
  return keepCase ? base : base.charAt(0).toLowerCase() + base.slice(1);
}
