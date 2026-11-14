// Scan pages pick QRdx's language from Accept-Language (lib/i18n/accept-language.ts).

import { LOCALES } from "@repo/i18n/config";
import { describe, expect, it } from "vitest";
import {
  negotiateLocale,
  parseAcceptLanguage,
} from "@/lib/i18n/accept-language";

describe("negotiateLocale", () => {
  it.each([
    // Exact and by language
    ["hi", "hi"],
    ["hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7", "hi"],
    ["ja-JP", "ja"],
    ["es-MX,es;q=0.9", "es"],
    ["fr-CA", "fr"],
    ["de-AT,de;q=0.9", "de"],
    ["it-CH", "it"],
    ["ko-KR", "ko"],
    ["id-ID", "id"],
    ["in-ID", "id"],
    ["en-GB,en;q=0.9", "en"],
    // Portuguese: every variant reads the Brazilian catalog
    ["pt", "pt-BR"],
    ["pt-BR", "pt-BR"],
    ["pt-PT,pt;q=0.9", "pt-BR"],
    // Simplified Chinese
    ["zh", "zh-Hans"],
    ["zh-CN", "zh-Hans"],
    ["zh-SG", "zh-Hans"],
    ["zh-Hans", "zh-Hans"],
    ["zh-Hans-CN", "zh-Hans"],
    ["zh-Hans-HK", "zh-Hans"],
    // Traditional Chinese has no catalog: English, not Simplified
    ["zh-TW", "en"],
    ["zh-HK", "en"],
    ["zh-MO", "en"],
    ["zh-Hant", "en"],
    ["zh-Hant-TW", "en"],
    ["zh-TW,zh;q=0.9,en;q=0.8", "en"],
    // q-values order the preferences
    ["en;q=0.5,ja;q=0.9", "ja"],
    ["de;q=0.2, fr;q=0.8, es;q=0.5", "fr"],
    ["ja;q=0, hi;q=0.3", "hi"],
    ["ja;q=0.8,hi;q=0.8", "ja"],
    // Unknown languages are skipped; nothing usable is English
    ["nl-NL,nl;q=0.9,de;q=0.8", "de"],
    ["sv-SE,nb;q=0.9", "en"],
    ["ar,he", "en"],
    ["*", "en"],
    ["", "en"],
    [null, "en"],
    [undefined, "en"],
    // Malformed parts are ignored
    ["ja;q=abc,hi", "hi"],
    ["!!,hi;q=0.5", "hi"],
    ["ja;q=2,ko", "ko"],
    ["  JA-jp  ;  Q=0.9  ", "ja"],
  ] as const)("%j → %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("returns only supported locales", () => {
    for (const header of ["hi", "zh-CN", "pt-PT", "xx", "en-US"]) {
      expect(LOCALES).toContain(negotiateLocale(header));
    }
  });

  it("reads a bounded header", () => {
    const long = `${"xx-XX;q=0.9,".repeat(200)}ja`;
    expect(negotiateLocale(long)).toBe("en");
    expect(parseAcceptLanguage(long).length).toBeLessThanOrEqual(24);
  });

  it("orders ranges by q, then by position", () => {
    expect(
      parseAcceptLanguage("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.9, *;q=0.5").map(
        (range) => range.tag,
      ),
    ).toEqual(["fr-ch", "fr", "de", "en", "*"]);
  });
});
