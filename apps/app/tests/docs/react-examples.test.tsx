// The code samples of the React library docs (apps/docs/content/docs: the
// quickstart, usage, Next.js, the feature pages, the reference pages and the
// registry component pages) live in tests/docs-examples: each docs code block
// must be the example file as it is (a registry component imported from
// @/components/<name>, where shadcn installs it), and each example must
// render a code that decodes to what the docs say.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, it as test, vi } from "vitest";
import {
  decodeQR,
  rasterizeSvg,
} from "../../../../packages/qrdx/tests/support/raster";
import { AngularCode } from "../docs-examples/colors/angular-code";
import { BrandCode as ColorsBrandCode } from "../docs-examples/colors/brand-code";
import { GradientCode } from "../docs-examples/colors/gradient-code";
import { RadialCode } from "../docs-examples/colors/radial-code";
import { MenuFrameCode } from "../docs-examples/frames/menu-frame-code";
import { OfficialFrameCode } from "../docs-examples/frames/official-frame-code";
import { DownloadSvgButton as MenuDownloadSvgButton } from "../docs-examples/getting-started/download-svg-button";
import { FirstQrCode } from "../docs-examples/getting-started/first-qr-code";
import { StyledQrCode } from "../docs-examples/getting-started/styled-qr-code";
import { ImageSettingsCode } from "../docs-examples/logos/image-settings-code";
import { LogoCode as LogosLogoCode } from "../docs-examples/logos/logo-code";
import { PlacedLogoCode } from "../docs-examples/logos/placed-logo-code";
import { RoundLogoCode } from "../docs-examples/logos/round-logo-code";
import { DownloadSvgButton } from "../docs-examples/nextjs/download-svg-button";
import { LiveQrCode } from "../docs-examples/nextjs/live-qr-code";
import { LogoQrCode } from "../docs-examples/nextjs/logo-qr-code";
import Page from "../docs-examples/nextjs/server-page";
import TicketPage from "../docs-examples/nextjs/ticket-page";
import { CircleCode } from "../docs-examples/patterns/circle-code";
import { EyeColorsCode } from "../docs-examples/patterns/eye-colors-code";
import { HeartCode } from "../docs-examples/patterns/heart-code";
import { LightCode } from "../docs-examples/patterns/light-code";
import { ShapedCode } from "../docs-examples/patterns/shaped-code";
import { LinkQrCode } from "../docs-examples/qr-code/link-qr-code";
import MenuPage from "../docs-examples/qr-code/menu-page";
import { TableCode } from "../docs-examples/qr-code/print-code";
import { GuestWifi } from "../docs-examples/qr-code/wifi-code";
import { QrReader } from "../docs-examples/qr-detection/qr-reader";
import { BrandCard } from "../docs-examples/registry/brand-card";
import { BrandGenerator } from "../docs-examples/registry/brand-generator";
import { DraftGenerator } from "../docs-examples/registry/draft-generator";
import { ShareAfterSave } from "../docs-examples/registry/share-after-save";
import { TrackedDownload } from "../docs-examples/registry/tracked-download";
import { FramedCode as CircleFramedCode } from "../docs-examples/styles/framed-code";
import { ArrowCode } from "../docs-examples/templates/arrow-code";
import { ArrowFrameCode } from "../docs-examples/templates/arrow-frame-code";
import { BoxedLogoCode } from "../docs-examples/templates/boxed-logo-code";
import { DocsRingCode } from "../docs-examples/templates/docs-ring-code";
import { DotRingCode } from "../docs-examples/templates/dot-ring-code";
import { RingTemplateCode } from "../docs-examples/templates/ring-template-code";
import { BrandCode } from "../docs-examples/usage/brand-code";
import { FramedCode } from "../docs-examples/usage/framed-code";
import { LogoCode } from "../docs-examples/usage/logo-code";
import { MenuCode } from "../docs-examples/usage/menu-code";
import { RoundedCode } from "../docs-examples/usage/rounded-code";
import { ContrastChecker } from "../docs-examples/utilities/contrast-checker";

const DOCS = join(import.meta.dirname, "../../../docs/content/docs");
const EXAMPLES = join(import.meta.dirname, "../docs-examples");

/** The example files each docs page must print, as they are. */
const PAGES: Record<string, string[]> = {
  "getting-started.mdx": [
    "getting-started/first-qr-code.tsx",
    "getting-started/styled-qr-code.tsx",
    "getting-started/download-svg-button.tsx",
  ],
  "usage.mdx": [
    "usage/menu-code.tsx",
    "usage/brand-code.tsx",
    "usage/rounded-code.tsx",
    "usage/logo-code.tsx",
    "usage/framed-code.tsx",
  ],
  "nextjs.mdx": [
    "nextjs/server-page.tsx",
    "nextjs/ticket-page.tsx",
    "nextjs/live-qr-code.tsx",
    "nextjs/logo-qr-code.tsx",
    "nextjs/download-svg-button.tsx",
  ],
  "styles.mdx": ["styles/framed-code.tsx"],
  "features/patterns.mdx": [
    "patterns/shaped-code.tsx",
    "patterns/light-code.tsx",
    "patterns/circle-code.tsx",
    "patterns/heart-code.tsx",
    "patterns/eye-colors-code.tsx",
  ],
  "features/colors-gradients.mdx": [
    "colors/brand-code.tsx",
    "colors/gradient-code.tsx",
    "colors/radial-code.tsx",
    "colors/angular-code.tsx",
  ],
  "features/logos.mdx": [
    "logos/logo-code.tsx",
    "logos/placed-logo-code.tsx",
    "logos/round-logo-code.tsx",
    "logos/image-settings-code.tsx",
  ],
  "features/templates.mdx": [
    "templates/arrow-code.tsx",
    "templates/boxed-logo-code.tsx",
    "templates/dot-ring-code.tsx",
    "templates/docs-ring-code.tsx",
    "templates/arrow-frame-code.tsx",
    "templates/ring-template-code.tsx",
  ],
  "features/frames.mdx": [
    "frames/menu-frame-code.tsx",
    "frames/official-frame-code.tsx",
  ],
  "utilities.mdx": ["utilities/contrast-checker.tsx"],
  "qr-detection.mdx": ["qr-detection/qr-reader.tsx"],
  "components/qr-code.mdx": [
    "qr-code/menu-page.tsx",
    "qr-code/wifi-code.tsx",
    "qr-code/link-qr-code.tsx",
    "qr-code/print-code.tsx",
  ],
  "components/qr-code-card.mdx": ["registry/brand-card.tsx"],
  "components/qr-code-download.mdx": ["registry/tracked-download.tsx"],
  "components/qr-code-share-dialog.mdx": ["registry/share-after-save.tsx"],
  "components/qr-code-generator.mdx": [
    "registry/brand-generator.tsx",
    "registry/draft-generator.tsx",
  ],
};

/** The bodies of the titled tsx code blocks in a docs page. */
function codeBlocks(page: string): string[] {
  const source = readFileSync(join(DOCS, page), "utf8");
  return [...source.matchAll(/```tsx title="[^"]+"\n([\s\S]*?)\n```/g)].map(
    (match) => match[1] ?? "",
  );
}

const example = (path: string) =>
  readFileSync(join(EXAMPLES, path), "utf8")
    .trimEnd()
    .replace(/@\/registry\/qrdx\//g, "@/components/");

/** The first <svg> in the markup (the code), decoded. */
function decodeFirstSvg(html: string): string | null {
  const start = html.indexOf("<svg");
  const end = html.indexOf("</svg>", start);
  const svg = html.slice(start, end + "</svg>".length);
  return decodeQR(rasterizeSvg(svg, { width: 520, pad: 24 }));
}

/** The whole root <svg>, frame or template included, decoded. */
function decodeRootSvg(html: string): string | null {
  const start = html.indexOf("<svg");
  const end = html.lastIndexOf("</svg>");
  const svg = html.slice(start, end + "</svg>".length);
  return decodeQR(rasterizeSvg(svg, { width: 640, pad: 24 }));
}

/** The registry component's code, inside its role="img" box. */
function decodeQrCodeComponent(html: string): string | null {
  const box = html.match(/role="img"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  return decodeFirstSvg(box);
}

/** Decodes the SVG a download button saves through a stubbed document. */
async function savedSvg(button: { props: { onClick: () => unknown } }) {
  const saved: { href: string; download: string }[] = [];
  vi.stubGlobal("document", {
    createElement: () => {
      const link = {
        href: "",
        download: "",
        click: () => saved.push({ ...link }),
      };
      return link;
    },
    body: { appendChild: () => undefined, removeChild: () => undefined },
  });
  await button.props.onClick();
  expect(saved).toHaveLength(1);
  const svg = decodeURIComponent(
    saved[0]?.href.replace("data:image/svg+xml,", "") ?? "",
  );
  return { filename: saved[0]?.download, svg };
}

describe.each(Object.entries(PAGES))("%s", (page, files) => {
  test.each(files)("prints %s as it is", (file) => {
    expect(codeBlocks(page)).toContain(example(file));
  });
});

describe("the quickstart's examples", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the first code in the default look", () => {
    expect(decodeFirstSvg(renderToStaticMarkup(<FirstQrCode />))).toBe(
      "https://example.com",
    );
  });

  it("renders the styled code with its banner", () => {
    const html = renderToStaticMarkup(<StyledQrCode />);
    expect(html).toContain("Scan for the menu");
    expect(decodeRootSvg(html)).toBe("https://example.com/menu");
  });

  it("saves the framed code as menu.svg", async () => {
    const { filename, svg } = await savedSvg(MenuDownloadSvgButton());
    expect(filename).toBe("menu.svg");
    expect(svg).toContain("Scan for the menu");
    expect(decodeQR(rasterizeSvg(svg, { width: 640, pad: 24 }))).toBe(
      "https://example.com/menu",
    );
  });
});

describe("the usage page's examples", () => {
  it("labels the code through its wrapper", () => {
    expect(renderToStaticMarkup(<MenuCode />)).toContain(
      'role="img" aria-label="QR code for the menu"',
    );
  });

  it.each([
    ["the labelled code", <MenuCode key="menu" />, "https://example.com/menu"],
    ["the brand colors", <BrandCode key="brand" />, "https://example.com"],
    [
      "the rounded shapes",
      <RoundedCode key="rounded" />,
      "https://example.com",
    ],
    ["the logo", <LogoCode key="logo" />, "https://example.com"],
  ])("decode with %s", (_name, element, value) => {
    expect(decodeFirstSvg(renderToStaticMarkup(element))).toBe(value);
  });

  it("decodes inside the banner frame", () => {
    expect(decodeRootSvg(renderToStaticMarkup(<FramedCode />))).toBe(
      "https://example.com",
    );
  });
});

describe("the Next.js guide's examples", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a labelled code in a Server Component", () => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain('aria-label="QR code for example.com"');
    expect(decodeFirstSvg(html)).toBe("https://example.com");
  });

  it("encodes the route param", async () => {
    const html = renderToStaticMarkup(
      await TicketPage({ params: Promise.resolve({ id: "A 12/7" }) }),
    );
    expect(decodeFirstSvg(html)).toBe(
      "https://example.com/check-in/A%2012%2F7",
    );
  });

  it("renders the client component's first value on the server", () => {
    const html = renderToStaticMarkup(<LiveQrCode />);
    expect(html).toContain("<input");
    expect(decodeFirstSvg(html)).toBe("https://example.com");
  });

  it("still scans with the logo's modules cleared", () => {
    const html = renderToStaticMarkup(<LogoQrCode />);
    expect(html).toContain("/logo.png");
    expect(decodeFirstSvg(html)).toBe("https://example.com");
  });

  it("saves a 1024 px SVG that decodes", async () => {
    const { filename, svg } = await savedSvg(
      DownloadSvgButton({ value: "https://example.com/menu" }),
    );
    expect(filename).toBe("qr-code.svg");
    expect(svg).toContain('width="1024"');
    expect(decodeQR(rasterizeSvg(svg, { width: 520, pad: 24 }))).toBe(
      "https://example.com/menu",
    );
  });
});

describe("the shape, color, logo, template and frame examples", () => {
  it.each([
    ["liquid modules with leaf eyes", <ShapedCode key="shaped" />],
    ["a lighter module scale", <LightCode key="light" />],
    ["a circle code", <CircleCode key="circle" />],
    ["a heart code", <HeartCode key="heart" />],
    ["per-eye colors", <EyeColorsCode key="eyes" />],
    ["brand colors", <ColorsBrandCode key="brand" />],
    ["a linear gradient", <GradientCode key="linear" />],
    ["a radial gradient", <RadialCode key="radial" />],
    ["an angular gradient", <AngularCode key="angular" />],
    ["a logo", <LogosLogoCode key="logo" />],
    ["a placed logo", <PlacedLogoCode key="placed" />],
    ["a round logo on a plate", <RoundLogoCode key="round" />],
    ["raw image settings", <ImageSettingsCode key="image-settings" />],
    ["the Arrow template", <ArrowCode key="arrow" />],
    ["a boxed logo", <BoxedLogoCode key="boxed" />],
    ["the Arrow spec as a frame", <ArrowFrameCode key="arrow-frame" />],
    ["a template drawn in code", <RingTemplateCode key="ring" />],
    ["a banner frame", <MenuFrameCode key="banner" />],
    ["an official frame", <OfficialFrameCode key="official" />],
    ["the circle frame", <CircleFramedCode key="circle-frame" />],
  ])("decodes with %s", (_name, element) => {
    expect(decodeRootSvg(renderToStaticMarkup(element))).toMatch(
      /^https:\/\/example\.com/,
    );
  });

  it.each([
    ["with a label along the ring", <DotRingCode key="dot-ring" />],
    ["with the ring filled", <DocsRingCode key="docs-ring" />],
  ])("decodes the Dot Ring %s", (_name, element) => {
    const html = renderToStaticMarkup(element);
    expect(html).toContain("<text");
    expect(decodeRootSvg(html)).toMatch(/^https:\/\/example\.com/);
  });

  it("draws the official frame with its own label", () => {
    expect(renderToStaticMarkup(<OfficialFrameCode />)).toContain(
      "Scan for offers",
    );
  });
});

describe("the reference pages' examples", () => {
  it("shows the contrast of black on white", () => {
    expect(renderToStaticMarkup(<ContrastChecker />)).toContain(
      "21.00:1, AAA. Excellent contrast",
    );
  });

  it("offers a file input to decode", () => {
    expect(renderToStaticMarkup(<QrReader />)).toContain('type="file"');
  });
});

describe("the QR Code component's examples", () => {
  it("renders the menu page's code with its caption", () => {
    const html = renderToStaticMarkup(<MenuPage />);
    expect(html).toContain("Scan to see the menu");
    expect(decodeQrCodeComponent(html)).toBe("https://example.com/menu");
  });

  it("encodes a Wi-Fi payload and labels it without the password", () => {
    const html = renderToStaticMarkup(<GuestWifi />);
    expect(html).toContain('aria-label="QR code to join the Cafe Guest Wi-Fi"');
    expect(html).not.toContain('aria-label="QR code: WIFI:');
    expect(decodeQrCodeComponent(html)).toBe(
      "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;;",
    );
  });

  it("hides the buttons for a value still being typed", () => {
    const html = renderToStaticMarkup(<LinkQrCode />);
    expect(html).not.toContain("<fieldset");
    expect(decodeQrCodeComponent(html)).toBe("https://example.com");
  });

  it("offers SVG, PNG and PDF for print", () => {
    const html = renderToStaticMarkup(<TableCode />);
    for (const format of ["SVG", "PNG", "PDF"]) expect(html).toContain(format);
    expect(decodeQrCodeComponent(html)).toBe(
      "https://example.com/order?table=12",
    );
  });
});

describe("the other registry components' examples", () => {
  it("renders the styled card with its title", () => {
    const html = renderToStaticMarkup(<BrandCard />);
    expect(html).toContain("example.com");
    expect(decodeQrCodeComponent(html)).toBe("https://example.com");
  });

  it("renders the download menu's trigger", () => {
    expect(
      renderToStaticMarkup(<TrackedDownload url="https://example.com" />),
    ).toContain("Download");
  });

  it("renders the controlled dialog's own trigger", () => {
    expect(
      renderToStaticMarkup(<ShareAfterSave url="https://example.com" />),
    ).toContain("Save and share");
  });

  it("renders the generator with the extra preset", () => {
    const html = renderToStaticMarkup(<BrandGenerator />);
    expect(html).toContain("Brand");
    expect(html).toContain("Classic");
  });

  it("renders the generator that reports drafts", () => {
    expect(
      renderToStaticMarkup(<DraftGenerator saveDraft={() => undefined} />),
    ).toContain("Text or URL");
  });
});
