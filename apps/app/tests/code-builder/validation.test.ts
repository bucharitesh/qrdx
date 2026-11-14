// Validation as you type and where server errors show
// (components/code-builder/validation.ts and links.ts).
import { describe, expect, it } from "vitest";
import { PREVIEW_SLUG, previewLink } from "@/components/code-builder/links";
import { EMPTY_FIELDS } from "@/components/code-builder/types";
import {
  changedFields,
  checkDestination,
  fieldForError,
  fieldsEqual,
  fitStyleForSave,
  MAX_SAVED_STYLE_LENGTH,
  needsUpgrade,
} from "@/components/code-builder/validation";
import { isReservedSlug, SHORT_LINK_BASE } from "@/lib/short-links";

describe("checkDestination", () => {
  it("adds https:// like a browser and returns the normalized URL", () => {
    expect(checkDestination("example.com/menu")).toEqual({
      ok: true,
      url: "https://example.com/menu",
    });
    expect(checkDestination("  http://example.com  ")).toEqual({
      ok: true,
      url: "http://example.com/",
    });
  });

  it("says what's wrong in the server's own words", () => {
    const message = (raw: string) => {
      const result = checkDestination(raw);
      return result.ok ? null : result.message;
    };
    expect(message("")).toBe("Enter a destination URL");
    expect(message("ftp://example.com/file")).toBe(
      "Only http:// and https:// links can be used",
    );
    expect(message("javascript:alert(1)")).toBe(
      "Only http:// and https:// links can be used",
    );
    expect(message("https://user:secret@example.com")).toBe(
      "Links with a username or password are not allowed",
    );
    expect(message(`${SHORT_LINK_BASE}/q/abc1234`)).toBe(
      "A dynamic code cannot point to another QRdx short link",
    );
    expect(message(`https://example.com/${"a".repeat(2100)}`)).toBe(
      "The destination URL is too long",
    );
    expect(message("http://")).toBe("Enter a full URL, starting with https://");
  });
});

describe("server errors", () => {
  it("map typed error codes to their field", () => {
    expect(fieldForError({ code: "SLUG_TAKEN", message: "Taken" })).toBe(
      "slug",
    );
    expect(fieldForError({ code: "INVALID_SLUG", message: "Reserved" })).toBe(
      "slug",
    );
    expect(
      fieldForError({ code: "UNSAFE_DESTINATION", message: "Unsafe" }),
    ).toBe("destination");
    expect(fieldForError({ code: "DOMAIN_NOT_VERIFIED", message: "x" })).toBe(
      "domain",
    );
    expect(fieldForError({ code: "LIMIT_REACHED", message: "Cap" })).toBe(
      "form",
    );
    expect(fieldForError({ code: "RATE_LIMITED", message: "Slow" })).toBe(
      "form",
    );
  });

  it("send validation errors about the URL to the destination field", () => {
    expect(
      fieldForError({
        code: "VALIDATION_ERROR",
        message: "Enter a full URL, starting with https://",
      }),
    ).toBe("destination");
    expect(
      fieldForError({
        code: "VALIDATION_ERROR",
        message: "Titles can be up to 100 characters",
      }),
    ).toBe("form");
  });

  it("offer the upgrade dialog only for plan errors", () => {
    expect(needsUpgrade("LIMIT_REACHED")).toBe(true);
    expect(needsUpgrade("PLAN_REQUIRED")).toBe(true);
    expect(needsUpgrade("SLUG_TAKEN")).toBe(false);
  });
});

describe("changes", () => {
  const initial = {
    ...EMPTY_FIELDS,
    destination: "https://example.com/a",
    title: "Menu",
    slug: "abc1234",
    tagIds: ["t1", "t2"],
    style: { bodyPattern: "circle" as const },
  };

  it("ignore whitespace and tag order", () => {
    expect(
      fieldsEqual(initial, {
        ...initial,
        destination: " https://example.com/a ",
        tagIds: ["t2", "t1"],
      }),
    ).toBe(true);
    expect(fieldsEqual(initial, { ...initial, folderId: "f1" })).toBe(false);
  });

  it("list only what an edit changed", () => {
    const changes = changedFields(initial, {
      ...initial,
      title: "Spring menu",
      slug: "",
      style: { bodyPattern: "rounded" },
    });
    expect(changes).toEqual({
      destination: false,
      title: true,
      domain: false,
      // An empty back-half keeps the current one.
      slug: false,
      folder: false,
      tags: false,
      style: true,
    });
  });

  it("leave an oversized logo out of the saved design", () => {
    const logo = "A".repeat(MAX_SAVED_STYLE_LENGTH);
    expect(
      fitStyleForSave({ bodyPattern: "rounded", customLogo: logo }),
    ).toEqual({ style: { bodyPattern: "rounded" }, trimmed: true });
    expect(fitStyleForSave({ bodyPattern: "rounded" }).trimmed).toBe(false);
  });
});

describe("the preview link", () => {
  it("encodes a reserved word before the code exists, so a scan can't open anyone's code", () => {
    expect(isReservedSlug(PREVIEW_SLUG)).toBe(true);
    const preview = previewLink({
      current: null,
      host: null,
      slug: "",
      slugUsable: true,
    });
    expect(preview.value).toBe(`${SHORT_LINK_BASE}/q/${PREVIEW_SLUG}`);
    expect(preview.isPreview).toBe(true);
    expect(preview.label).toBe(`${SHORT_LINK_BASE}/q/…`);
  });

  it("encodes a chosen back-half once it passes the checks", () => {
    expect(
      previewLink({ current: null, host: null, slug: "menu", slugUsable: true })
        .value,
    ).toBe(`${SHORT_LINK_BASE}/q/menu`);
    expect(
      previewLink({
        current: null,
        host: null,
        slug: "menu",
        slugUsable: false,
      }).value,
    ).toBe(`${SHORT_LINK_BASE}/q/${PREVIEW_SLUG}`);
    expect(
      previewLink({
        current: null,
        host: "go.brand.com",
        slug: "menu",
        slugUsable: true,
      }).value,
    ).toBe("https://go.brand.com/menu");
  });

  it("keeps an edited code's own link until its domain or back-half changes", () => {
    const current = {
      shortLink: `${SHORT_LINK_BASE}/q/abc1234`,
      slug: "abc1234",
      domainChanged: false,
    };
    expect(
      previewLink({ current, host: null, slug: "abc1234", slugUsable: true }),
    ).toEqual({
      value: current.shortLink,
      label: current.shortLink,
      isPreview: false,
    });
    expect(
      previewLink({
        current: { ...current, domainChanged: true },
        host: "go.brand.com",
        slug: "abc1234",
        slugUsable: true,
      }).value,
    ).toBe("https://go.brand.com/abc1234");
  });
});
