// The playground's theme gallery thumbnails (components/editor/
// theme-gallery.tsx) draw a theme as the editor does: its border template,
// frame and logo, scaled to the thumbnail. Before, a bordered or logo theme
// showed as a plain code.
import { describe, expect, it } from "vitest";
import { thumbProps } from "@/components/editor/theme-gallery";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { defaultPresets } from "@/utils/qr-presets";

const SIZE = 96;
const styles = (id: string) => {
  const preset = defaultPresets[id];
  if (!preset) throw new Error(`no preset ${id}`);
  return preset.styles;
};

describe("theme gallery thumbnails", () => {
  it("draw a theme's border template", () => {
    expect(thumbProps(styles("ink"), SIZE).templateId).toBe("SquareBorder");
  });

  it.each(["logotype", "pebble"])(
    "draw the editor's default logo for %s, at its share of the code",
    (id) => {
      const props = thumbProps(styles(id), SIZE);
      expect(props.imageSettings?.src).toBe(DEFAULT_QR_LOGO);
      // The editor draws a 256 px logo on a 1024 px code.
      expect(props.imageSettings?.width).toBeCloseTo(SIZE / 4, 5);
      expect(props.size).toBe(SIZE);
    },
  );

  it("draw no logo, border or art for a plain theme, and keep frames", () => {
    const plain = thumbProps(styles("classic"), SIZE);
    expect(plain.imageSettings).toBeUndefined();
    expect(plain.templateId).toBeUndefined();
    expect(thumbProps(styles("guestWifi"), SIZE).frame?.style).toBe(
      "rounded-border",
    );
  });

  it("cap the quiet zone at three modules", () => {
    expect(thumbProps(styles("classic"), SIZE).margin).toBe(3);
  });

  it("render every built-in theme's template and logo", () => {
    for (const [id, preset] of Object.entries(defaultPresets)) {
      const props = thumbProps(preset.styles, SIZE);
      expect(props.templateId, id).toBe(preset.styles.templateId);
      expect(Boolean(props.imageSettings), id).toBe(
        Boolean(preset.styles.showLogo),
      );
    }
  });
});
