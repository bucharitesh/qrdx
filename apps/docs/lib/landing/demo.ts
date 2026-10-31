import { getBlock, parseLandingPageContent } from "@/lib/landing/blocks";
import {
  buildTemplateContent,
  getTemplate,
  listTemplates,
  type PageTemplate,
  type PageTemplateVariant,
} from "@/lib/landing/templates";
import { baseUrl } from "@/lib/metadata";
import type { LandingPageContent } from "@/types/landing";
import { demoPath } from "./demo-paths";

// Public template demos (/templates and /templates/<type>/<id>): each
// template's own content, plus sample media wherever the template leaves a
// file for the owner to add. On a published page an empty PDF, gallery or
// audio block shows nothing, so a demo without samples would look broken.
// Built in memory from the registry; nothing is read from or written to the
// database.

type Props = Record<string, unknown>;

/**
 * Unsplash photos via Lorem Picsum (fixed ids, so demos never change),
 * `scale` times the given size (gallery thumbnails ask for smaller files).
 */
const photo = (id: number, width: number, height: number, scale: number) => ({
  type: "url" as const,
  url: `https://picsum.photos/id/${id}/${Math.round(width * scale)}/${Math.round(height * scale)}`,
});

/** Files in public/samples (sample PDFs and short synthesized clips). */
const sampleFile = (name: string) => ({
  type: "url" as const,
  url: new URL(`/samples/${name}`, baseUrl).toString(),
});

/** CC0 clip from MDN's media examples. */
const SAMPLE_VIDEO = {
  type: "url" as const,
  url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
};

/** Stand-in for the owner's own review link (like the templates' other links). */
const SAMPLE_REVIEW_URL = "https://example.com/review";

interface SamplePhoto {
  id: number;
  alt: string;
}

const SUMMER: SamplePhoto[] = [
  { id: 64, alt: "Sunglasses and wildflowers" },
  { id: 1011, alt: "Canoe on a mountain lake" },
  { id: 1080, alt: "Fresh strawberries" },
  { id: 1050, alt: "Sea cliffs on a sunny day" },
];

/** Gallery photos by "<type>/<template id>"; others use SUMMER. */
const GALLERIES: Record<
  string,
  { photos: SamplePhoto[]; size: [number, number] }
> = {
  "images/gallery": { photos: SUMMER, size: [800, 800] },
  "images/portfolio": {
    photos: [
      { id: 1027, alt: "Portrait in soft light" },
      { id: 1015, alt: "Fjord from a cliff top" },
      { id: 250, alt: "Vintage camera" },
      { id: 1043, alt: "Valley with tall pines" },
      { id: 1018, alt: "Green hills and a winding road" },
      { id: 1067, alt: "City skyline at sunset" },
    ],
    size: [600, 600],
  },
  "images/event-photos": {
    photos: [
      { id: 453, alt: "Band on stage" },
      { id: 513, alt: "Guests at the bar" },
      { id: 42, alt: "Coffee on a long table" },
    ],
    size: [1200, 800],
  },
};

interface SampleAudio {
  cover?: number;
  tracks: string[];
}

/** Audio by "<type>/<template id>"; others get one sample track. */
const AUDIO: Record<string, SampleAudio> = {
  "mp3/album": { cover: 184, tracks: ["Headlights", "Neon rain", "Last exit"] },
  "mp3/podcast": {
    cover: 42,
    tracks: ["Ep. 12: Opening a second shop", "Ep. 11: Pricing for regulars"],
  },
  "mp3/voice-message": { tracks: ["Happy birthday from all of us"] },
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
  (props: Props, key: string, scale: number) => Props | null
> = {
  pdf: (props, key) =>
    props.source
      ? null
      : { source: sampleFile(PDFS[key] ?? "product-guide.pdf") },
  gallery: (props, key, scale) => {
    if (!isEmpty(props.images)) return null;
    const {
      photos,
      size: [width, height],
    } = GALLERIES[key] ?? { photos: SUMMER, size: [800, 800] };
    return {
      images: photos.map(({ id, alt }) => ({
        source: photo(id, width, height, scale),
        alt,
      })),
    };
  },
  audio: (props, key, scale) => {
    if (!isEmpty(props.tracks)) return null;
    const audio = AUDIO[key] ?? { tracks: ["Sample track"] };
    return {
      ...(audio.cover &&
        !props.cover && { cover: photo(audio.cover, 600, 600, scale) }),
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
        files: gallery.photos.slice(0, 2).map(({ id, alt }) => ({
          source: photo(id, 2400, 1600, 1),
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
  const scale = thumbnail ? 0.4 : 1;
  const content = buildTemplateContent(type, variantId);
  const key = `${type}/${variantId}`;
  const blocks = content.blocks.map((block, index) => {
    // Unique within the page and across gallery thumbnails (DOM ids derive from it).
    const id = `b${index + 1}-${type}-${variantId}`.slice(0, 64);
    const patch = SAMPLES[block.type]?.(block.props, key, scale);
    const definition = getBlock(block.type);
    if (!(patch && definition)) return { ...block, id };
    return {
      ...block,
      id,
      props: definition.schema.parse({ ...block.props, ...patch }) as Props,
    };
  });
  const parsed = parseLandingPageContent({ ...content, blocks });
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
