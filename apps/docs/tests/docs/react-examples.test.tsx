// The examples in content/docs/nextjs.mdx and content/docs/components/
// qr-code.mdx live in tests/docs-examples: each docs code block must be the
// example file as it is (the registry component imported from
// @/components/qr-code, where shadcn installs it), and each example must
// render a code that decodes to what the docs say.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeQR,
  rasterizeSvg,
} from "../../../../packages/qrdx/tests/support/raster";
import { DownloadSvgButton } from "../docs-examples/nextjs/download-svg-button";
import { LiveQrCode } from "../docs-examples/nextjs/live-qr-code";
import { LogoQrCode } from "../docs-examples/nextjs/logo-qr-code";
import Page from "../docs-examples/nextjs/server-page";
import TicketPage from "../docs-examples/nextjs/ticket-page";
import { LinkQrCode } from "../docs-examples/qr-code/link-qr-code";
import MenuPage from "../docs-examples/qr-code/menu-page";
import { TableCode } from "../docs-examples/qr-code/print-code";
import { GuestWifi } from "../docs-examples/qr-code/wifi-code";

const DOCS = join(import.meta.dirname, "../../content/docs");
const EXAMPLES = join(import.meta.dirname, "../docs-examples");

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
    .replace("@/registry/qrdx/qr-code", "@/components/qr-code");

/** The first <svg> in the markup (the code), decoded. */
function decodeFirstSvg(html: string): string | null {
  const start = html.indexOf("<svg");
  const end = html.indexOf("</svg>", start);
  const svg = html.slice(start, end + "</svg>".length);
  return decodeQR(rasterizeSvg(svg, { width: 520, pad: 24 }));
}

/** The registry component's code, inside its role="img" box. */
function decodeQrCodeComponent(html: string): string | null {
  const box = html.match(/role="img"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  return decodeFirstSvg(box);
}

describe("the Next.js guide's examples", () => {
  it.each([
    "nextjs/server-page.tsx",
    "nextjs/ticket-page.tsx",
    "nextjs/live-qr-code.tsx",
    "nextjs/logo-qr-code.tsx",
    "nextjs/download-svg-button.tsx",
  ])("prints %s as it is", (file) => {
    expect(codeBlocks("nextjs.mdx")).toContain(example(file));
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

  describe("the download button", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("saves a 1024 px SVG that decodes", async () => {
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
      const button = DownloadSvgButton({ value: "https://example.com/menu" });
      await button.props.onClick();
      expect(saved).toHaveLength(1);
      expect(saved[0]?.download).toBe("qr-code.svg");
      const svg = decodeURIComponent(
        saved[0]?.href.replace("data:image/svg+xml,", "") ?? "",
      );
      expect(svg).toContain('width="1024"');
      expect(decodeQR(rasterizeSvg(svg, { width: 520, pad: 24 }))).toBe(
        "https://example.com/menu",
      );
    });
  });
});

describe("the QR Code component's examples", () => {
  it.each([
    "qr-code/menu-page.tsx",
    "qr-code/wifi-code.tsx",
    "qr-code/link-qr-code.tsx",
    "qr-code/print-code.tsx",
  ])("prints %s as it is", (file) => {
    expect(codeBlocks("components/qr-code.mdx")).toContain(example(file));
  });

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
