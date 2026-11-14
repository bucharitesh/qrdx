// Pages people reach by scanning a code speak the scanner's language
// (Accept-Language): the /q status pages, ended pages, the password form,
// "Share your location?" and QRdx's words on hosted pages (/p). The /q
// pages set <html lang>; hosted pages keep the owner's document language
// and mark QRdx's chrome with its own lang.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRANSLATED_LOCALES } from "@repo/i18n/config";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { statusPage } from "@/app/q/[slug]/status-page";
import { LandingPageFooter } from "@/components/landing/page-footer";
import { LandingRender } from "@/components/landing/render";
import { loadMessages } from "@/lib/i18n/messages";
import {
  ENGLISH_SCAN_PAGES,
  scanPagesIntl,
  scanPagesIntlFor,
} from "@/lib/i18n/scan-pages";
import { buildDemoContent, listTemplateDemos } from "@/lib/landing/demo";
import { endedPage, neutralPage } from "@/lib/redirect/pages";
import { locationStepPage } from "@/lib/scan-location/step-page";
import en from "@/messages/en.json";

// next/font only works inside Next; the page fonts are irrelevant here.
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});

const ROOT = resolve(import.meta.dirname, "../..");
const catalog = (locale: string) =>
  JSON.parse(readFileSync(resolve(ROOT, `messages/${locale}.json`), "utf8"));

const request = (acceptLanguage?: string) => ({
  headers: new Headers(
    acceptLanguage ? { "accept-language": acceptLanguage } : {},
  ),
});

describe("the scanner's language", () => {
  it.each([
    ["hi-IN,hi;q=0.9,en;q=0.8", "hi"],
    ["ja", "ja"],
    ["zh-TW,zh;q=0.9", "en"],
    ["pt-PT", "pt-BR"],
    [undefined, "en"],
  ])("%s → %s", async (header, locale) => {
    expect((await scanPagesIntlFor(request(header))).locale).toBe(locale);
  });

  it("has every scan-page string in every language", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "string"
        ? [prefix]
        : Object.entries(value as object).flatMap(([key, child]) =>
            keys(child, prefix ? `${prefix}.${key}` : key),
          );
    const english = keys(en.scanPages);
    for (const locale of TRANSLATED_LOCALES) {
      const translated = new Set(keys(catalog(locale).scanPages ?? {}));
      expect(
        english.filter((key) => !translated.has(key)),
        locale,
      ).toEqual([]);
    }
  });
});

describe("/q status pages", () => {
  it("stay English by default, with <html lang=en>", async () => {
    const response = statusPage("not-found");
    const html = await response.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("QR code not found");
    expect(response.headers.get("Content-Language")).toBe("en");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Accept-Language");
  });

  it.each(["hi", "ja"] as const)(
    "speak %s, with <html lang> and a localized home link",
    async (locale) => {
      const intl = await scanPagesIntl(locale);
      const response = statusPage("inactive", { intl });
      expect(response.status).toBe(410);
      const html = await response.text();
      const copy = catalog(locale).scanPages.status;
      expect(html).toContain(`<html lang="${locale}">`);
      expect(html).toContain(copy.inactive.title);
      expect(html).toContain(copy.makeYourOwn);
      expect(html).toContain(`/${locale}"`);
      expect(html).not.toContain("no longer active");
      expect(response.headers.get("Content-Language")).toBe(locale);
    },
  );

  it("keeps the GS1 parser's English detail out of other languages", async () => {
    const detail = "The GTIN check digit is wrong.";
    const english = await statusPage("invalid-gs1", { message: detail }).text();
    expect(english).toContain(detail);
    const intl = await scanPagesIntl("ja");
    const japanese = await statusPage("invalid-gs1", {
      message: detail,
      intl,
    }).text();
    expect(japanese).not.toContain(detail);
    expect(japanese).toContain(catalog("ja").scanPages.status.invalidGs1.title);
  });
});

describe("ended pages and the password form", () => {
  it("translate the ended page and its Report abuse link (still the English form)", async () => {
    const intl = await scanPagesIntl("hi");
    const html = await endedPage("paused", "abc", intl).text();
    const copy = catalog("hi").scanPages;
    expect(html).toContain('<html lang="hi">');
    expect(html).toContain(copy.ended.paused.title);
    expect(html).toContain(copy.reportAbuse);
    expect(html).toContain("/report-abuse?slug=abc");
  });

  it("escapes translated text", async () => {
    const html = await neutralPage({
      status: 200,
      title: "<b>x</b>",
      body: "",
      intl: ENGLISH_SCAN_PAGES,
    }).text();
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("Share your location?", () => {
  it.each(["hi", "ja"] as const)(
    "speaks %s, script text included",
    async (locale) => {
      const intl = await scanPagesIntl(locale);
      const response = locationStepPage({
        token: "t",
        next: "https://example.com/menu",
        slug: "abc",
        intl,
      });
      const html = await response.text();
      const copy = catalog(locale).scanPages.location;
      expect(html).toContain(`<html lang="${locale}">`);
      expect(html).toContain(copy.title);
      expect(html).toContain("<strong>example.com</strong>");
      // The inline script's status lines come from the page's data.
      expect(html).toContain(JSON.stringify(copy.waiting).slice(1, -1));
      expect(html).not.toContain("Waiting for your browser");
      // Privacy and Report abuse still open the English pages.
      expect(html).toContain("/legal/privacy-policy#precise-location");
      expect(html).toContain("/report-abuse?slug=abc");
      expect(response.headers.get("Content-Language")).toBe(locale);
    },
  );
});

describe("hosted pages (/p)", () => {
  const renderIn = async (locale: "en" | "ja", node: React.ReactNode) =>
    renderToStaticMarkup(
      <NextIntlClientProvider
        locale={locale}
        messages={await loadMessages(locale)}
        timeZone="UTC"
      >
        {node}
      </NextIntlClientProvider>,
    );

  it("marks QRdx's footer with the scanner's language", async () => {
    const html = await renderIn(
      "ja",
      <LandingPageFooter
        badge
        badgeHref="https://qrdx.dev/ja"
        reportHref="https://qrdx.dev/report-abuse?slug=a"
      />,
    );
    const copy = catalog("ja").scanPages;
    expect(html).toContain('lang="ja"');
    expect(html).toContain(copy.hosted.madeWithQrdx);
    expect(html).toContain(copy.reportAbuse);
  });

  // QRdx's own English on hosted pages, as it read before translation.
  const ENGLISH = [
    "Save contact",
    "Add to calendar",
    "Open in Maps",
    "Redeem coupon",
    "Terms and conditions",
    "Copy coupon code",
    "Sold out",
    "Contains:",
    "Leave a review",
    "Open in your browser",
    "Download on the App Store",
    "Nutrition",
  ];

  const renderDemos = async (locale: "en" | "ja") => {
    let html = "";
    for (const { template, variant } of listTemplateDemos()) {
      const content = buildDemoContent(template.type, variant.id);
      html += await renderIn(
        locale,
        <LandingRender
          content={content}
          context={{
            theme: content.theme,
            mode: "live",
            pageId: "p",
            qrCodeId: null,
          }}
        />,
      );
    }
    return html;
  };

  it("render every template demo in Japanese without QRdx's English", async () => {
    // The demos do show these words in English, so the check below can fail.
    const english = await renderDemos("en");
    const shown = ENGLISH.filter((text) => english.includes(`>${text}<`));
    expect(shown.length).toBeGreaterThan(8);
    // Template content is the owner's (English demo text); QRdx's words aren't.
    const japanese = await renderDemos("ja");
    expect(shown.filter((text) => japanese.includes(`>${text}<`))).toEqual([]);
  });
});
