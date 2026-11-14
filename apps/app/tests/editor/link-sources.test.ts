// The URL form's "Use a link from…" menu offers only what can work on this
// deployment: connected accounts first, one Connect item for the rest, and
// nothing at all when signed out or when no provider is offered.
import { describe, expect, it } from "vitest";
import {
  buildLinkSourceMenu,
  connectableSummary,
  type LinkAvailability,
  type LinkConnection,
  type LinkSource,
} from "@/components/editor/link-sources";

const account = (
  slug: string,
  capability: LinkConnection["capability"],
  state: Partial<LinkConnection> = {},
): LinkConnection => ({
  slug,
  name: slug[0]?.toUpperCase() + slug.slice(1),
  logo: `/integrations/${slug}.svg`,
  capability,
  configured: true,
  connected: true,
  status: "active",
  ...state,
});

const source = (slug: string, state: Partial<LinkSource> = {}): LinkSource => ({
  slug,
  name: slug[0]?.toUpperCase() + slug.slice(1),
  logo: `/integrations/${slug}.svg`,
  configured: true,
  needsQuery: false,
  connected: true,
  status: "active",
  ...state,
});

const open: LinkAvailability = { hidden: [], needsSetup: {} };

describe("buildLinkSourceMenu", () => {
  it("hides the menu until everything has loaded (or when signed out)", () => {
    expect(buildLinkSourceMenu(null, [], open)).toBeNull();
    expect(buildLinkSourceMenu([], null, open)).toBeNull();
    expect(buildLinkSourceMenu([], [], null)).toBeNull();
  });

  it("hides the menu when nothing is offered here", () => {
    expect(buildLinkSourceMenu([], [], open)).toBeNull();
    expect(
      buildLinkSourceMenu(
        [account("bitly", "short-links", { configured: false })],
        [source("stripe", { configured: false })],
        open,
      ),
    ).toBeNull();
  });

  it("lists working accounts first: shorteners, files, then sources", () => {
    const menu = buildLinkSourceMenu(
      [account("dropbox", "files"), account("bitly", "short-links")],
      [source("stripe")],
      open,
    );
    expect(menu?.ready.map((option) => [option.kind, option.slug])).toEqual([
      ["short-links", "bitly"],
      ["files", "dropbox"],
      ["source", "stripe"],
    ]);
    expect(menu?.connectable).toEqual([]);
  });

  it("offers the rest under one Connect item, including broken connections", () => {
    const menu = buildLinkSourceMenu(
      [
        account("bitly", "short-links", { connected: false, status: null }),
        account("box", "files", { status: "error" }),
      ],
      [source("shopify", { connected: false, status: null })],
      open,
    );
    expect(menu?.ready).toEqual([]);
    expect(menu?.connectable).toEqual(["Bitly", "Box", "Shopify"]);
  });

  it("never shows a provider that isn't set up on this deployment", () => {
    const menu = buildLinkSourceMenu(
      [account("bitly", "short-links"), account("dropbox", "files")],
      [source("stripe"), source("calendly", { connected: false })],
      { hidden: ["dropbox"], needsSetup: { calendly: ["CALENDLY_CLIENT_ID"] } },
    );
    expect(menu?.ready.map((option) => option.slug)).toEqual([
      "bitly",
      "stripe",
    ]);
    expect(menu?.connectable).toEqual([]);
  });

  it("leaves out sources that need a query (they belong to other types)", () => {
    expect(
      buildLinkSourceMenu([], [source("youtube", { needsQuery: true })], open),
    ).toBeNull();
  });
});

describe("connectableSummary", () => {
  it("names up to three, then counts the rest", () => {
    expect(connectableSummary([])).toBe("");
    expect(connectableSummary(["Bitly"])).toBe("Bitly");
    expect(connectableSummary(["Bitly", "Dropbox"])).toBe("Bitly and Dropbox");
    expect(connectableSummary(["Bitly", "Dropbox", "Stripe"])).toBe(
      "Bitly, Dropbox and Stripe",
    );
    expect(
      connectableSummary(["Bitly", "Dropbox", "Stripe", "Shopify", "Box"]),
    ).toBe("Bitly, Dropbox, Stripe and 2 more");
  });
});
