// The docs site is one zone of qrdx.dev: links to docs pages stay in this app
// (next/link), and every other internal link loads the main app's page in
// full (components/zone-link.tsx, components/i18n/locale-link.tsx).
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleLink, useLocaleRouter } from "@/components/i18n/locale-link";
import { ZoneLink } from "@/components/zone-link";

// next/link marks its anchors, to tell them from plain <a> elements.
vi.mock("next/link", async (importOriginal) => {
  const { default: Link } = await importOriginal<typeof import("next/link")>();
  return {
    default: (props: ComponentProps<typeof Link>) => (
      <Link {...props} data-next-link="" />
    ),
  };
});

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
};
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/es/docs",
  useRouter: () => router,
}));

const inSpanish = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={{}} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );

describe("ZoneLink", () => {
  it("uses next/link for docs pages", () => {
    for (const href of ["/docs", "/docs/styles", "/es/docs/help"]) {
      expect(
        renderToStaticMarkup(<ZoneLink href={href}>x</ZoneLink>),
      ).toContain("data-next-link");
    }
  });

  it("uses a plain <a> for the rest of the site, without next/link's props", () => {
    for (const href of ["/", "/pricing", "/playground?type=wifi", "/docs.md"]) {
      expect(
        renderToStaticMarkup(
          <ZoneLink href={href} prefetch={false} scroll={false}>
            x
          </ZoneLink>,
        ),
      ).toBe(`<a href="${href}">x</a>`);
    }
  });
});

describe("LocaleLink", () => {
  it("keeps the reader's language on both kinds of link", () => {
    const docs = inSpanish(<LocaleLink href="/docs/styles">x</LocaleLink>);
    expect(docs).toContain('href="/es/docs/styles"');
    expect(docs).toContain("data-next-link");

    const pricing = inSpanish(<LocaleLink href="/pricing">x</LocaleLink>);
    expect(pricing).toBe('<a href="/es/pricing">x</a>');
  });
});

let localeRouter: ReturnType<typeof useLocaleRouter> | undefined;

/** Keeps the router useLocaleRouter returns while it renders. */
function CaptureRouter() {
  localeRouter = useLocaleRouter();
  return null;
}

describe("useLocaleRouter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("navigates within the docs, and loads other pages in full", () => {
    const location = { assign: vi.fn(), replace: vi.fn() };
    vi.stubGlobal("window", { location });
    inSpanish(<CaptureRouter />);

    localeRouter?.push("/docs/styles");
    expect(router.push).toHaveBeenCalledWith("/es/docs/styles", undefined);

    localeRouter?.push("/pricing");
    expect(location.assign).toHaveBeenCalledWith("/es/pricing");

    // A page that isn't translated keeps its English URL.
    localeRouter?.replace("/community");
    expect(location.replace).toHaveBeenCalledWith("/community");

    localeRouter?.prefetch("/pricing");
    expect(router.prefetch).not.toHaveBeenCalled();
  });
});
