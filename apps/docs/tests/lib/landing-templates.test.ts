import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, LANDING_FONTS } from "@/components/landing/theme";
import { buildDemoContent } from "@/lib/landing/demo";
import { buildTemplateContent, listTemplates } from "@/lib/landing/templates";
import { TEMPLATE_MEDIA_PATH } from "@/lib/landing/templates/media";

// The hosted-page template set: ids people may have used stay, every palette
// is legible, and every photo ships with the app, is credited and has a
// thumbnail copy.

const PUBLIC = join(import.meta.dirname, "../../public");
const MEDIA_DIR = join(PUBLIC, TEMPLATE_MEDIA_PATH);

/** Template ids that shipped before the redesign (pages and links use them). */
const SHIPPED = {
  links: ["creator", "musician", "minimal", "podcast"],
  business: ["local-shop", "studio", "professional"],
  vcard: ["classic", "midnight", "minimal"],
  menu: ["cafe", "restaurant", "bar"],
  coupon: ["store-discount", "free-item", "member-offer"],
  event: ["party", "conference", "webinar"],
  apps: ["app-launch", "game"],
  feedback: ["guest-feedback", "nps-survey", "sign-up"],
  pdf: ["document", "menu", "brochure"],
  images: ["gallery", "portfolio", "event-photos"],
  mp3: ["album", "podcast", "voice-message"],
  video: ["product-video", "uploaded-video", "looping-clip"],
  custom: ["blank", "announcement"],
};

const templates = listTemplates();
const variants = templates.flatMap((template) =>
  template.variants.map((variant) => ({
    key: `${template.type}/${variant.id}`,
    content: buildTemplateContent(template.type, variant.id),
  })),
);

/** Every template-media file a value links to. */
function mediaFiles(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    const index = value.indexOf(TEMPLATE_MEDIA_PATH);
    if (index >= 0) found.add(value.slice(index + TEMPLATE_MEDIA_PATH.length));
  } else if (Array.isArray(value)) {
    for (const item of value) mediaFiles(item, found);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) mediaFiles(item, found);
  }
  return found;
}

describe("landing page templates", () => {
  it("keeps every template id that has shipped", () => {
    for (const [type, ids] of Object.entries(SHIPPED)) {
      const template = templates.find((item) => item.type === type);
      expect(template, type).toBeDefined();
      const current = template?.variants.map((variant) => variant.id) ?? [];
      for (const id of ids) expect(current, type).toContain(id);
    }
  });

  it("offers 3 to 5 templates per page type", () => {
    for (const template of templates) {
      expect(template.variants.length, template.type).toBeGreaterThanOrEqual(
        template.type === "custom" ? 2 : 3,
      );
      expect(template.variants.length, template.type).toBeLessThanOrEqual(5);
    }
  });

  it("uses palettes that pass WCAG AA", () => {
    for (const { key, content } of variants) {
      const c = content.theme.colors;
      const pairs: Array<[string, string, string]> = [
        ["text on background", c.foreground, c.background],
        ["secondary text on background", c.mutedForeground, c.background],
        ["text on cards", c.foreground, c.muted],
        ["secondary text on cards", c.mutedForeground, c.muted],
        ["text on accent", c.primaryForeground, c.primary],
      ];
      for (const [label, fg, bg] of pairs) {
        expect(
          contrastRatio(fg, bg),
          `${key}: ${label} (${fg} on ${bg})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("uses known fonts", () => {
    const ids = new Set<string>(LANDING_FONTS.map((font) => font.id));
    for (const { key, content } of variants) {
      expect(ids.has(content.theme.font), key).toBe(true);
      if (content.theme.headingFont) {
        expect(ids.has(content.theme.headingFont), key).toBe(true);
      }
    }
  });

  it("links only to photos that ship, are credited and have a thumbnail", () => {
    const credits = readFileSync(join(MEDIA_DIR, "CREDITS.md"), "utf8");
    const used = new Set<string>();
    for (const template of templates) {
      for (const variant of template.variants) {
        for (const file of mediaFiles(
          buildDemoContent(template.type, variant.id),
        )) {
          used.add(file);
        }
      }
    }
    expect(used.size).toBeGreaterThan(20);
    for (const file of used) {
      expect(existsSync(join(MEDIA_DIR, file)), file).toBe(true);
      if (file.endsWith(".webp")) {
        expect(credits, `${file} credit`).toContain(`\`${file}\``);
        const small = file.replace(/\.webp$/, ".sm.webp");
        expect(existsSync(join(MEDIA_DIR, small)), small).toBe(true);
      }
    }
  });

  it("uses the half-size photos in thumbnails", () => {
    const full = mediaFiles(buildDemoContent("menu", "cafe"));
    const small = mediaFiles(
      buildDemoContent("menu", "cafe", { thumbnail: true }),
    );
    expect([...full].some((file) => file.endsWith(".webp"))).toBe(true);
    for (const file of small) {
      if (file.endsWith(".webp")) expect(file).toMatch(/\.sm\.webp$/);
    }
  });

  it("never hotlinks demo media", () => {
    for (const template of templates) {
      for (const variant of template.variants) {
        const json = JSON.stringify(
          buildDemoContent(template.type, variant.id),
        );
        expect(json, `${template.type}/${variant.id}`).not.toContain(
          "picsum.photos",
        );
      }
    }
  });
});
