// lib/customers.ts: the one switch per customer that keeps an unapproved
// customer story out of the blog and the company off the home page.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOMERS,
  type Customer,
  customerStoryHref,
  getPublishedCustomers,
  isHiddenCustomerStory,
} from "@/lib/customers";

const APP = join(import.meta.dirname, "../..");
const flam = CUSTOMERS.find((customer) => customer.id === "flam") as Customer;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("customers", () => {
  it("every customer's story is a post in content/blog", () => {
    for (const customer of CUSTOMERS) {
      expect(
        existsSync(join(APP, "content/blog", `${customer.storySlug}.mdx`)),
        customer.id,
      ).toBe(true);
      expect(customerStoryHref(customer)).toBe(`/blog/${customer.storySlug}`);
    }
  });

  it("hides a story, by file path or slug, until its customer is published", () => {
    const hidden = [{ ...flam, published: false }];
    expect(isHiddenCustomerStory(`${flam.storySlug}.mdx`, hidden)).toBe(true);
    expect(isHiddenCustomerStory(flam.storySlug, hidden)).toBe(true);
    expect(getPublishedCustomers(hidden)).toEqual([]);

    const live = [{ ...flam, published: true }];
    expect(isHiddenCustomerStory(`${flam.storySlug}.mdx`, live)).toBe(false);
    expect(getPublishedCustomers(live).map((c) => c.id)).toEqual(["flam"]);
  });

  it("leaves every other post alone", () => {
    expect(isHiddenCustomerStory("introducing-qrdx.mdx")).toBe(false);
    expect(isHiddenCustomerStory("launching-qrdx")).toBe(false);
  });

  it("is the only filter the blog needs: only lib/content-source.ts reads the blog collection", () => {
    const readers = ["app", "lib", "components", "scripts"]
      .flatMap((dir) => walk(join(APP, dir)))
      .filter((file) => /\.(ts|tsx|mts)$/.test(file))
      .filter((file) =>
        /import\s*\{[^}]*\bblog\b[^}]*\}\s*from\s*"@\/\.source\/content"/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(APP, file));
    expect(readers).toEqual(["lib/content-source.ts"]);
    expect(readFileSync(join(APP, "lib/content-source.ts"), "utf8")).toContain(
      "isHiddenCustomerStory(post.info.path)",
    );
  });
});
