// Translated pages remember their language (components/i18n/remember-locale.tsx)
// with the language menu's cookie, written the same way; English pages
// leave it alone.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  TRANSLATED_LOCALES,
} from "@/lib/i18n/config";
import {
  localeCookieString,
  readLocaleCookie,
  rememberLocale,
  rememberPageLocale,
} from "@/lib/i18n/locale-cookie";

/** A document.cookie stand-in: each write sets one cookie, reads list them. */
function jar(initial: Record<string, string> = {}) {
  const cookies = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    writes,
    get cookie() {
      return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(value: string) {
      writes.push(value);
      const [pair = ""] = value.split(";");
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    },
  };
}

const ROOT = resolve(import.meta.dirname, "../..");

describe("the language cookie", () => {
  it("is written with the language menu's attributes", () => {
    expect(localeCookieString("hi")).toBe(
      `${LOCALE_COOKIE}=hi; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`,
    );
    const page = jar();
    rememberLocale("pt-BR", page);
    expect(page.writes).toEqual([localeCookieString("pt-BR")]);
  });

  it("reads its own value among other cookies", () => {
    expect(
      readLocaleCookie(jar({ a: "1", [LOCALE_COOKIE]: "ja", b: "2" })),
    ).toBe("ja");
    expect(readLocaleCookie(jar({ a: "1" }))).toBeUndefined();
    expect(readLocaleCookie(undefined)).toBeUndefined();
  });

  it.each(TRANSLATED_LOCALES)("a %s page remembers its language", (locale) => {
    const page = jar();
    expect(rememberPageLocale(locale, page)).toBe(true);
    expect(readLocaleCookie(page)).toBe(locale);
  });

  it("a page in another language replaces an earlier choice", () => {
    const page = jar({ [LOCALE_COOKIE]: "es" });
    expect(rememberPageLocale("hi", page)).toBe(true);
    expect(readLocaleCookie(page)).toBe("hi");
  });

  it("doesn't rewrite the cookie it already has", () => {
    const page = jar({ [LOCALE_COOKIE]: "hi" });
    expect(rememberPageLocale("hi", page)).toBe(false);
    expect(page.writes).toEqual([]);
  });

  it("English pages leave the cookie alone (they're shared with no preference)", () => {
    const fresh = jar();
    expect(rememberPageLocale("en", fresh)).toBe(false);
    expect(fresh.writes).toEqual([]);
    const chosen = jar({ [LOCALE_COOKIE]: "ja" });
    expect(rememberPageLocale("en", chosen)).toBe(false);
    expect(readLocaleCookie(chosen)).toBe("ja");
  });

  it("without a document (server rendering) does nothing", () => {
    expect(rememberPageLocale("hi", undefined)).toBe(false);
  });

  it("is remembered by every translated page, after hydration only", () => {
    const layout = readFileSync(resolve(ROOT, "app/[lang]/layout.tsx"), "utf8");
    expect(layout).toContain("<RememberLocale />");
    const component = readFileSync(
      resolve(ROOT, "components/i18n/remember-locale.tsx"),
      "utf8",
    );
    // A client effect: the [lang] pages stay static (no cookies() there).
    expect(component).toMatch(/^"use client";/);
    expect(component).toContain("useEffect(");
    expect(layout).not.toMatch(/next\/headers|cookies\(\)/);
  });
});
