// The rules for short-link back-halves (lib/short-links.ts), as
// apps/docs/content/docs/dynamic-qr-codes.mdx (#custom-back-halves) states them.
import { describe, expect, it } from "vitest";
import {
  codeLinks,
  DOMAIN_RESERVED_SLUGS,
  generateSlug,
  isGeneratedSlug,
  isReservedSlug,
  isValidSlug,
  RESERVED_SLUGS,
  SHARED_SLUG_SCOPE,
  slugProblem,
} from "@/lib/short-links";

const shared = (slug: string) => slugProblem(slug, { onCustomDomain: false });
const onDomain = (slug: string) => slugProblem(slug, { onCustomDomain: true });

describe("custom back-halves", () => {
  it("are 3 to 64 letters, digits, - or _", () => {
    for (const slug of [
      "abc",
      "spring-menu",
      "Spring_Menu",
      "a-b_c",
      "2026",
      "_x_",
      "a".repeat(64),
    ]) {
      expect(shared(slug), slug).toBeNull();
    }
    expect(shared("ab")).toBe("length");
    expect(shared("a".repeat(65))).toBe("length");
    expect(shared("")).toBe("length");
    for (const slug of [
      "menu.html",
      "a b",
      "a/b",
      "menü",
      "a%20b",
      "a+b",
      "a@b",
    ]) {
      expect(shared(slug), slug).toBe("characters");
    }
  });

  it("can't start or end with a dash", () => {
    expect(shared("-menu")).toBe("dash");
    expect(shared("menu-")).toBe("dash");
    expect(shared("spring--menu")).toBeNull();
  });

  it("reserve QRdx words on the shared domain, in any case", () => {
    for (const word of [
      "api",
      "admin",
      "docs",
      "q",
      "p",
      "m",
      "settings",
      "login",
      "dashboard",
      "pricing",
      "oauth",
      "www",
      "qrdx",
    ]) {
      expect(RESERVED_SLUGS.has(word), word).toBe(true);
    }
    expect(shared("Admin")).toBe("reserved");
    expect(shared("LOGIN")).toBe("reserved");
    expect(shared("sign-in")).toBe("reserved");
    expect(isReservedSlug("Settings")).toBe(true);
  });

  it("reserve only the domain's own paths on a custom domain", () => {
    expect([...DOMAIN_RESERVED_SLUGS].sort()).toEqual(
      ["_next", "api", "null", "p", "q", "undefined"].sort(),
    );
    expect(onDomain("pricing")).toBeNull();
    expect(onDomain("login")).toBeNull();
    expect(onDomain("API")).toBe("reserved");
  });

  it("every list entry is lower case (lookups lower-case the slug)", () => {
    for (const word of [...RESERVED_SLUGS, ...DOMAIN_RESERVED_SLUGS]) {
      expect(word).toBe(word.toLowerCase());
    }
  });
});

describe("slug shapes", () => {
  it("accepts generated slugs and back-halves before a lookup", () => {
    expect(isValidSlug("Ab3xK9q")).toBe(true);
    expect(isValidSlug("spring-menu")).toBe(true);
    // Reserved words simply never exist on the shared domain.
    expect(isValidSlug("pricing")).toBe(true);
    for (const slug of [
      "",
      "ab",
      "-x-",
      "a/b",
      "favicon.ico",
      "a".repeat(65),
    ]) {
      expect(isValidSlug(slug), slug).toBe(false);
    }
  });

  it("tells generated-looking slugs apart", () => {
    expect(isGeneratedSlug("Ab3xK9q")).toBe(true);
    expect(isGeneratedSlug("spring-menu")).toBe(false);
    expect(isGeneratedSlug("account")).toBe(false);
  });

  it("never generates a reserved or malformed slug", () => {
    for (let i = 0; i < 2000; i++) {
      const slug = generateSlug();
      expect(isGeneratedSlug(slug), slug).toBe(true);
    }
  });
});

describe("a code's links", () => {
  const brand = { hostname: "go.brand.com", verified: true };

  it("keep qrdx.dev/q/<slug> for shared slugs, also on a custom domain", () => {
    expect(
      codeLinks({ slug: "Ab3xK9q", slugScope: SHARED_SLUG_SCOPE }, null),
    ).toEqual({
      link: "http://localhost:3000/q/Ab3xK9q",
      defaultLink: "http://localhost:3000/q/Ab3xK9q",
    });
    expect(codeLinks({ slug: "Ab3xK9q", slugScope: "" }, brand)).toEqual({
      link: "https://go.brand.com/Ab3xK9q",
      defaultLink: "http://localhost:3000/q/Ab3xK9q",
    });
    // Until the domain is verified the default link is the one to encode.
    expect(
      codeLinks(
        { slug: "Ab3xK9q", slugScope: "" },
        { ...brand, verified: false },
      ).link,
    ).toBe("http://localhost:3000/q/Ab3xK9q");
  });

  it("have no qrdx.dev link for a domain's own back-half", () => {
    const code = { slug: "spring-menu", slugScope: "dom_brand" };
    expect(codeLinks(code, brand)).toEqual({
      link: "https://go.brand.com/spring-menu",
      defaultLink: null,
    });
    // Pending (an import before the DNS move): the link it will have.
    expect(codeLinks(code, { ...brand, verified: false }).link).toBe(
      "https://go.brand.com/spring-menu",
    );
  });
});
