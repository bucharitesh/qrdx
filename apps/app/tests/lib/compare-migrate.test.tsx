// The "How to switch" section of the compare pages: it never promises a
// switch "in minutes", and for imported codes it covers the three cases that
// decide whether printed codes need a reprint (own domain, still on the old
// provider's domain, already stopped). The own-domain case shows only where
// custom domains can be added.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { customDomains: true };

vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) =>
    id === "customDomains" && state.customDomains,
}));
vi.mock("@/components/i18n/locale-link", () => ({
  LocaleLink: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as string}</a>
  ),
}));
vi.mock("@/components/sections/compare/compare-migrate-button", () => ({
  CompareMigrateButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

const { CompareMigrate } = await import(
  "@/components/sections/compare/compare-migrate"
);

const render = (slug: string, competitor: string) =>
  renderToStaticMarkup(<CompareMigrate competitor={competitor} slug={slug} />)
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");

describe("compare pages: How to switch", () => {
  beforeEach(() => {
    state.customDomains = true;
  });

  it("covers own domain, the old provider's domain and stopped codes", () => {
    const html = render("flowcode", "Flowcode");
    expect(html).toContain("How to switch");
    expect(html).not.toMatch(/in minutes/i);
    expect(html).toContain("On a domain you own");
    expect(html).toContain("No reprint");
    expect(html).toContain(
      'href="/docs/migrate#your-own-domain-go-yourbrand-com"',
    );
    expect(html).toContain("On Flowcode's domain");
    expect(html).toContain("If your codes have already stopped");
    expect(html).toContain("Reprint once");
    expect(html).toContain('href="/guarantee"');
    // Flowcode's folder download is documented, so the first step uses it.
    expect(html).toContain("Download URLs");
  });

  it("leaves out the own-domain case where custom domains can't be added", () => {
    state.customDomains = false;
    const html = render("uniqode", "Uniqode");
    expect(html).not.toContain("On a domain you own");
    expect(html).toContain("On Uniqode's domain");
    expect(html).toContain("If your codes have already stopped");
  });

  it("keeps the single printed-codes note for static tools and libraries", () => {
    for (const [slug, name] of [
      ["goqr", "goQR.me"],
      ["qrcode-react", "qrcode.react"],
    ] as const) {
      const html = render(slug, name);
      expect(html).toContain("Printed codes");
      expect(html).not.toContain("If your codes have already stopped");
      expect(html).not.toContain("On a domain you own");
    }
  });
});
