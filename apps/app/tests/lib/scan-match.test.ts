// The photo check's comparison (lib/scan-match.ts): when the text decoded
// from a photo counts as what the editor's design encodes.
import { describe, expect, it } from "vitest";
import { asWebLink, compareDecoded, matchKey } from "@/lib/scan-match";

const matches = (decoded: string, expected: string) =>
  compareDecoded(decoded, expected).matches;

describe("web addresses", () => {
  it("match when identical", () => {
    expect(matches("https://acme.com/menu", "https://acme.com/menu")).toBe(
      true,
    );
  });

  it("ignore one trailing slash on the path", () => {
    expect(matches("https://acme.com/menu/", "https://acme.com/menu")).toBe(
      true,
    );
    expect(matches("https://acme.com", "https://acme.com/")).toBe(true);
    expect(
      matches("https://acme.com/menu/?t=1", "https://acme.com/menu?t=1"),
    ).toBe(true);
  });

  it("don't ignore more than one trailing slash", () => {
    expect(matches("https://acme.com/menu//", "https://acme.com/menu")).toBe(
      false,
    );
  });

  it("ignore case in the scheme and host only", () => {
    expect(matches("HTTPS://ACME.COM/menu", "https://acme.com/menu")).toBe(
      true,
    );
    expect(matches("https://acme.com/Menu", "https://acme.com/menu")).toBe(
      false,
    );
    expect(matches("https://acme.com/?q=A", "https://acme.com/?q=a")).toBe(
      false,
    );
    expect(matches("https://acme.com/#Top", "https://acme.com/#top")).toBe(
      false,
    );
  });

  it("drop default ports and empty ? or #", () => {
    expect(matches("https://acme.com:443/menu", "https://acme.com/menu")).toBe(
      true,
    );
    expect(matches("http://acme.com:80/", "http://acme.com")).toBe(true);
    expect(matches("https://acme.com/menu?", "https://acme.com/menu")).toBe(
      true,
    );
    expect(matches("https://acme.com/menu#", "https://acme.com/menu")).toBe(
      true,
    );
    expect(matches("https://acme.com:8443/", "https://acme.com/")).toBe(false);
  });

  it("compare percent escapes without case", () => {
    expect(
      matches("https://acme.com/caf%c3%a9", "https://acme.com/caf%C3%A9"),
    ).toBe(true);
    expect(matches("https://acme.com/café", "https://acme.com/caf%C3%A9")).toBe(
      true,
    );
  });

  it("treat http and https, and www, as different links", () => {
    expect(matches("http://acme.com/menu", "https://acme.com/menu")).toBe(
      false,
    );
    expect(matches("https://www.acme.com/menu", "https://acme.com/menu")).toBe(
      false,
    );
  });

  it("keep the query's order", () => {
    expect(
      matches("https://acme.com/?a=1&b=2", "https://acme.com/?b=2&a=1"),
    ).toBe(false);
  });

  it("keep user names apart", () => {
    expect(matches("https://me@acme.com/", "https://acme.com/")).toBe(false);
  });

  it("say which side is a link", () => {
    expect(compareDecoded("https://acme.com", "WIFI:S:Cafe;;")).toEqual({
      matches: false,
      decodedIsLink: true,
      expectedIsLink: false,
    });
    expect(compareDecoded("hello", "https://acme.com")).toEqual({
      matches: false,
      decodedIsLink: false,
      expectedIsLink: true,
    });
  });
});

describe("other content", () => {
  it("ignores surrounding whitespace and Windows line endings", () => {
    expect(matches("  hello\n", "hello")).toBe(true);
    expect(matches("BEGIN:VCARD\r\nEND:VCARD", "BEGIN:VCARD\nEND:VCARD")).toBe(
      true,
    );
    expect(matches(" https://acme.com/menu\n", "https://acme.com/menu")).toBe(
      true,
    );
  });

  it("is case-sensitive", () => {
    expect(matches("WIFI:S:Cafe;P:Secret;;", "WIFI:S:cafe;P:secret;;")).toBe(
      false,
    );
    expect(matches("Hello", "hello")).toBe(false);
  });

  it("doesn't treat a bare host or other schemes as web addresses", () => {
    expect(asWebLink("acme.com/menu")).toBeNull();
    expect(asWebLink("mailto:me@acme.com")).toBeNull();
    expect(asWebLink("ftp://acme.com/")).toBeNull();
    expect(matches("acme.com/menu", "https://acme.com/menu")).toBe(false);
    expect(matches("MAILTO:me@acme.com", "mailto:me@acme.com")).toBe(false);
  });

  it("keeps inner whitespace", () => {
    expect(matchKey("a  b")).toBe("a  b");
    expect(matches("a b", "a  b")).toBe(false);
  });
});
