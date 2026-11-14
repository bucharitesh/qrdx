// ServerSnapshot puts the real UI in the server HTML (inert, since the
// browser never hydrates it), and the public type generators use it: a
// generator page's first HTML has the type's form with its default values
// instead of a skeleton.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TypeGenerator } from "@/components/sections/tools/type-generator";
import { ServerSnapshot } from "@/components/server-snapshot";
import { renderIntl } from "../support/intl";

vi.mock("next/navigation", () => ({
  usePathname: () => "/qr-code-generator/wifi",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("ServerSnapshot", () => {
  it("renders its children on the server, inert, without the fallback", () => {
    const html = renderToStaticMarkup(
      <ServerSnapshot fallback={<p>skeleton</p>}>
        <input aria-label="name" />
      </ServerSnapshot>,
    );
    expect(html).toContain('<div class="contents" inert="">');
    expect(html).toContain('<input aria-label="name"/>');
    expect(html).not.toContain("skeleton");
  });
});

describe("type generator server HTML", () => {
  const html = renderIntl(<TypeGenerator type="wifi" />);

  it("has the Wi-Fi form, not the loading skeleton", () => {
    expect(html).toContain('id="wifi-ssid"');
    expect(html).toContain('id="wifi-password"');
    expect(html).toContain('id="wifi-hidden"');
    expect(html).not.toContain('data-slot="skeleton"');
  });

  it("shows the default security choice, which Radix only fills in the browser", () => {
    expect(html).toContain("WPA/WPA2");
  });

  it("has the preview's empty state and the downloads, inert until mount", () => {
    expect(html).toContain('inert=""');
    expect(html).toContain('id="quiet-zone"');
    for (const format of ["PNG", "WebP", "SVG"]) expect(html).toContain(format);
  });
});
