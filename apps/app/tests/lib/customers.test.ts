// lib/customers.ts: the one switch per customer that puts its story at
// /customers/<id> and the company on the home page. Customer stories live in
// content/customers, never in the blog.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOMERS,
  type Customer,
  customerStoryHref,
  getPublishedCustomers,
  isPublishedCustomerStory,
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

const mdxIn = (dir: string) =>
  readdirSync(join(APP, "content", dir)).filter((file) =>
    file.endsWith(".mdx"),
  );

/** Files under app, lib, components and scripts that import `name` from the compiled content. */
function readersOf(name: string): string[] {
  const pattern = new RegExp(
    `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"@/\\.source/server"`,
  );
  return ["app", "lib", "components", "scripts"]
    .flatMap((dir) => walk(join(APP, dir)))
    .filter((file) => /\.(ts|tsx|mts)$/.test(file))
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => relative(APP, file));
}

describe("customers", () => {
  it("every customer has its story in content/customers, at /customers/<id>", () => {
    for (const customer of CUSTOMERS) {
      expect(
        existsSync(join(APP, "content/customers", `${customer.id}.mdx`)),
        customer.id,
      ).toBe(true);
      expect(customerStoryHref(customer)).toBe(`/customers/${customer.id}`);
    }
  });

  it("every story belongs to a customer", () => {
    const ids = CUSTOMERS.map((customer) => customer.id as string);
    for (const file of mdxIn("customers")) {
      expect(ids, file).toContain(file.replace(/\.mdx$/, ""));
    }
  });

  it("shows a story, by file path or slug, only once its customer is published", () => {
    const hidden = [{ ...flam, published: false }];
    expect(isPublishedCustomerStory("flam.mdx", hidden)).toBe(false);
    expect(isPublishedCustomerStory("flam", hidden)).toBe(false);
    expect(getPublishedCustomers(hidden)).toEqual([]);

    const live = [{ ...flam, published: true }];
    expect(isPublishedCustomerStory("flam.mdx", live)).toBe(true);
    expect(isPublishedCustomerStory("flam", live)).toBe(true);
    expect(getPublishedCustomers(live).map((c) => c.id)).toEqual(["flam"]);
  });

  it("leaves out a story file with no customer", () => {
    expect(isPublishedCustomerStory("acme.mdx")).toBe(false);
    expect(isPublishedCustomerStory("flam-branded-qr-codes.mdx")).toBe(false);
  });

  it("is the only filter the section needs: only lib/content-source.ts reads the customers collection", () => {
    expect(readersOf("customers")).toEqual(["lib/content-source.ts"]);
    expect(readFileSync(join(APP, "lib/content-source.ts"), "utf8")).toContain(
      "isPublishedCustomerStory(story.info.path)",
    );
  });
});

describe("the blog", () => {
  it("has no customer story: not Flam's old post, its images or the tag", () => {
    expect(
      existsSync(join(APP, "content/blog/flam-branded-qr-codes.mdx")),
    ).toBe(false);
    expect(existsSync(join(APP, "public/blog/flam"))).toBe(false);
    for (const file of mdxIn("blog")) {
      const source = readFileSync(join(APP, "content/blog", file), "utf8");
      const frontmatter = source.split(/^---$/m)[1] ?? "";
      expect(frontmatter, file).not.toMatch(/"customer story"/i);
    }
  });

  it("reads its collection unfiltered, and only lib/content-source.ts reads it", () => {
    expect(readersOf("blog")).toEqual(["lib/content-source.ts"]);
    expect(readFileSync(join(APP, "lib/content-source.ts"), "utf8")).toMatch(
      /baseUrl: "\/blog",\s*source: blog\.toFumadocsSource\(\),/,
    );
  });
});
