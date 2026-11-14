// Every way into the playground goes through lib/playground-links.ts: code
// calls playgroundHref(), and Markdown links (which can't call it) carry only
// parameters the playground reads. Hub plan, phase 5.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  handoffSource,
  type PlaygroundParams,
  parsePlaygroundParams,
  playgroundHref,
  withHandoffRef,
} from "@/lib/playground-links";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ORIGIN = "https://qrdx.dev";

function files(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full, extensions));
    else if (extensions.some((extension) => name.endsWith(extension))) {
      out.push(full);
    }
  }
  return out;
}

const relative = (file: string) => path.relative(ROOT, file);

describe("withHandoffRef", () => {
  it("adds the tag to the query, before the #", () => {
    expect(withHandoffRef(playgroundHref(), "not-found")).toBe(
      "/playground?ref=not-found",
    );
    expect(
      withHandoffRef(
        playgroundHref({ type: "wifi", tab: "design" }),
        "not-found",
      ),
    ).toBe("/playground?tab=design&type=wifi&ref=not-found");
    expect(
      withHandoffRef(playgroundHref({ url: "https://example.com" }), "x"),
    ).toBe("/playground?ref=x#url=https%3A%2F%2Fexample.com%2F");
  });

  it("is what handoffSource reports, and leaves the link's parameters alone", () => {
    const href = withHandoffRef(playgroundHref({ type: "wifi" }), "not-found");
    const url = new URL(href, ORIGIN);
    expect(handoffSource("", ORIGIN, url.searchParams.get("ref"))).toBe(
      "not-found",
    );
    expect(parsePlaygroundParams(url.search, url.hash)).toEqual({
      type: "wifi",
    });
  });

  it("never takes a value as a tag", () => {
    for (const ref of [
      "https://evil.example",
      "a b",
      "UPPER",
      "",
      "x".repeat(40),
    ]) {
      expect(withHandoffRef("/playground", ref)).toBe("/playground");
    }
  });
});

/** Query and `#` names the reader turns into each field. */
const FIELD: Record<string, keyof PlaygroundParams> = {
  tab: "tab",
  section: "section",
  type: "type",
  sample: "sample",
  url: "url",
  preset: "preset",
  style: "style",
  open: "open",
  print: "print",
  printDistance: "printDistance",
  lang: "lang",
};

describe("Markdown links into the playground", () => {
  const LINK = /\]\((\/playground[^)\s]*)\)|href="(\/playground[^"]*)"/g;
  // This app's content and the docs' (apps/docs/content).
  const links = [
    path.join(ROOT, "content"),
    path.join(ROOT, "..", "docs", "content"),
  ]
    .flatMap((dir) => files(dir, [".mdx", ".md"]))
    .flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(LINK)].map((match) => ({
        file: relative(file),
        href: (match[1] ?? match[2]) as string,
      })),
    );

  it("finds the links (the pattern still matches the content)", () => {
    expect(links.length).toBeGreaterThan(40);
  });

  it("carries only parameters the playground reads, with valid values", () => {
    for (const { file, href } of links) {
      const url = new URL(href, ORIGIN);
      expect(url.pathname, `${file}: ${href}`).toMatch(
        /^\/playground(\/[\w-]+)?$/,
      );
      const params = parsePlaygroundParams(url.search, url.hash);
      const names = [
        ...url.searchParams.keys(),
        ...new URLSearchParams(url.hash.replace(/^#/, "")).keys(),
      ].filter((name) => name !== "ref");
      for (const name of names) {
        const field = FIELD[name];
        expect(field, `${file}: unknown parameter ${name}`).toBeDefined();
        if (field) {
          expect(params[field], `${file}: ${href} drops ${name}`).toBeDefined();
        }
      }
    }
  });
});

describe("links in code", () => {
  // Hand-built links into the playground: an href, a push or a template with
  // a query or theme id. Plain "/playground" in metadata, the sitemap and
  // pathname checks isn't a link and isn't matched.
  const HAND_BUILT =
    /href="\/playground|href=\{`\/playground|(?:push|replace)\(["'`]\/playground|["'`]\/playground\?|`\/playground\/\$\{/;

  // Files that still build their own, each in another lane of the hub plan.
  const ELSEWHERE: Record<string, string> = {};
  const ELSEWHERE_DIRS = [
    "components/editor/", // hub phases 3 and 4
    "components/code-builder/", // hub phase 4
    "components/app-shell/", // dashboard shell
  ];

  it("go through playgroundHref everywhere else", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of files(path.join(ROOT, dir), [".ts", ".tsx"])) {
        const name = relative(file);
        if (name === "lib/playground-links.ts") continue;
        if (name in ELSEWHERE) continue;
        if (ELSEWHERE_DIRS.some((prefix) => name.startsWith(prefix))) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, index) => {
            const code = line.trim();
            if (code.startsWith("//") || code.startsWith("*")) return;
            if (HAND_BUILT.test(code)) offenders.push(`${name}:${index + 1}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
