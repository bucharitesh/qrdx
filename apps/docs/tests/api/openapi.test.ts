// The REST API's OpenAPI document (packages/docs-assets/openapi.json and its
// served copy public/openapi.json, written by `bun run openapi:generate` from
// lib/openapi/document.ts) stays complete and current: every /v1 route
// handler has an operation, the committed file is exactly what the generator
// builds from today's schemas, the served copy has the same bytes, the
// reference pages (content/docs/developers/api) match it, and the errors
// catalogue (lib/openapi/errors.ts, content/docs/developers/errors.mdx)
// covers every error code the API code can throw.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "@/lib/openapi/document";
import { API_ERRORS } from "@/lib/openapi/errors";
import {
  errorsPage,
  indexPage,
  metaJson,
  operationsOf,
} from "../../scripts/openapi/pages";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const OPENAPI_DOCUMENT = "../../packages/docs-assets/openapi.json";

type Json = Record<string, any>;
const document = JSON.parse(JSON.stringify(buildOpenApiDocument())) as Json;
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** `app/api/v1/codes/[id]/route.ts` → `/codes/{id}`; null for the 404 catch-all. */
function routePath(file: string): string | null {
  const segments = relative(join("app", "api", "v1"), file).split(sep);
  segments.pop();
  if (segments.some((segment) => segment.startsWith("[["))) return null;
  return `/${segments.map((s) => s.replace(/^\[(.+)\]$/, "{$1}")).join("/")}`;
}

const routeOperations = walk(join("app", "api", "v1"))
  .filter((file) => file.endsWith(`${sep}route.ts`))
  .flatMap((file) => {
    const path = routePath(file);
    if (!path) return [];
    const source = read(file);
    return [
      ...source.matchAll(
        /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
      ),
    ].map((match) => `${(match[1] as string).toLowerCase()} ${path}`);
  });

const specOperations = Object.entries(document.paths as Json).flatMap(
  ([path, item]) =>
    METHODS.filter((method) => item[method]).map(
      (method) => `${method} ${path}`,
    ),
);

const operations = Object.entries(document.paths as Json).flatMap(
  ([path, item]) =>
    METHODS.filter((method) => item[method]).map((method) => ({
      key: `${method.toUpperCase()} ${path}`,
      operation: item[method] as Json,
    })),
);

/** Follows a local `$ref` (`#/components/...`). */
function deref(value: Json): Json {
  if (typeof value?.$ref !== "string") return value;
  const target = (value.$ref as string)
    .slice(2)
    .split("/")
    .reduce((node: Json, key) => node?.[key], document);
  expect(target, value.$ref).toBeDefined();
  return target;
}

describe("OpenAPI document", () => {
  it("packages/docs-assets/openapi.json is exactly what the generator builds (run `bun run openapi:generate`)", () => {
    const committed = JSON.parse(read(OPENAPI_DOCUMENT));
    expect(committed).toEqual(document);
  });

  it("public/openapi.json, served at /openapi.json, is a byte-for-byte copy (run `bun run openapi:generate`)", () => {
    expect(read("public/openapi.json") === read(OPENAPI_DOCUMENT)).toBe(true);
  });

  it("has an operation for every /v1 route handler, and no others", () => {
    expect(routeOperations.length).toBeGreaterThan(10);
    expect(specOperations.sort()).toEqual([...new Set(routeOperations)].sort());
  });

  it("is OpenAPI 3.1 on the public API host, with OAuth scopes", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(document.servers).toEqual([
      { url: "https://api.qrdx.dev/v1", description: "QRdx API" },
    ]);
    const oauth = document.components.securitySchemes.oauth2;
    expect(Object.keys(oauth.flows.authorizationCode.scopes).sort()).toEqual([
      "codes:read",
      "codes:write",
      "profile:read",
      "themes:read",
    ]);
  });

  it("gives every operation an id, summary, tag, description and a success example", () => {
    const ids = new Set<string>();
    for (const { key, operation } of operations) {
      expect(operation.operationId, key).toMatch(/^[a-z][A-Za-z]+$/);
      expect(ids.has(operation.operationId), key).toBe(false);
      ids.add(operation.operationId);
      expect(operation.summary, key).toBeTruthy();
      expect(operation.tags?.length, key).toBe(1);
      expect(operation.description, key).toBeTruthy();

      const success = Object.entries(operation.responses as Json).filter(
        ([status]) => status.startsWith("2"),
      );
      expect(success.length, key).toBeGreaterThan(0);
      for (const [status, response] of success) {
        const media = Object.values(deref(response).content ?? {}) as Json[];
        if (status === "204" || key === "GET /qr") continue;
        expect(
          media.some((m) => m.example || Object.keys(m.examples ?? {}).length),
          `${key} ${status}`,
        ).toBe(true);
      }
    }
  });

  // Public endpoints: no key, no daily quota.
  const KEYLESS = new Set([
    "GET /qr",
    "GET /barcode",
    "POST /barcode",
    "GET /community/items",
    "GET /community/items/{id}",
  ]);

  it("documents auth errors and the daily quota on every token endpoint", () => {
    for (const { key, operation } of operations) {
      const scopes = (operation.security as Json[]).flatMap(
        (requirement) => requirement.oauth2 ?? [],
      );
      if (KEYLESS.has(key)) {
        expect(operation.security).toEqual([]);
        continue;
      }
      expect(scopes.length, key).toBe(1);
      for (const status of ["401", "403", "429", "500"]) {
        expect(operation.responses[status], `${key} ${status}`).toBeDefined();
      }
      const tooMany = deref(operation.responses["429"]);
      expect(Object.keys(tooMany.headers).sort(), key).toEqual([
        "Retry-After",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
      ]);
      expect(
        deref(operation.responses["403"]).description,
        `${key} names its scope`,
      ).toContain("INSUFFICIENT_SCOPE");
    }
  });

  it("shows only production URLs in examples", () => {
    const text = JSON.stringify(document);
    expect(text).not.toMatch(/localhost|127\.0\.0\.1|example\.test/);
  });
});

describe("API reference pages (run `bun run openapi:generate`)", () => {
  const api = join("content", "docs", "developers", "api");
  const pages = operationsOf(document as never);

  it("has one page per operation, rendering that operation", () => {
    expect(pages.length).toBe(operations.length);
    for (const page of pages) {
      const source = read(join(api, `${page.slug}.mdx`));
      expect(source, page.slug).toContain(
        JSON.stringify([
          { path: page.path, method: page.method.toLowerCase() },
        ]),
      );
      expect(source, page.slug).toContain(`title: ${page.summary}`);
    }
    const generated = readdirSync(join(root, api)).filter(
      (file) => file.endsWith(".mdx") && file !== "index.mdx",
    );
    expect(generated.sort()).toEqual(pages.map((p) => `${p.slug}.mdx`).sort());
  });

  it("has a current index, sidebar and errors page", () => {
    expect(read(join(api, "index.mdx"))).toBe(
      indexPage(document as never, pages),
    );
    expect(JSON.parse(read(join(api, "meta.json")))).toEqual(
      metaJson(document as never, pages),
    );
    expect(read("content/docs/developers/errors.mdx")).toBe(errorsPage());
  });
});

describe("errors catalogue", () => {
  // Files whose thrown errors reach /v1 callers.
  const thrown = [
    ...walk(join("app", "api", "v1")).filter((file) => file.endsWith(".ts")),
    "app/(app)/dashboard/codes/_lib/qr-codes.ts",
    "app/(app)/dashboard/codes/_lib/code-kind.ts",
    "lib/api-errors.ts",
    "lib/api-quota.ts",
    "lib/request-guards.ts",
    "lib/events/endpoints.ts",
    "lib/safety/destinations.ts",
  ];
  const errorsIn = (files: string[]) =>
    new Set(
      files.flatMap((file) =>
        [
          ...read(file).matchAll(/new HttpError\(\s*(\d{3}),\s*"([A-Z_]+)"/g),
        ].map((match) => `${match[1]} ${match[2]}`),
      ),
    );
  const catalogued = new Set(
    API_ERRORS.map((error) => `${error.status} ${error.code}`),
  );

  it("covers every error code the API code throws", () => {
    const missing = [...errorsIn(thrown)].filter((e) => !catalogued.has(e));
    expect(missing).toEqual([]);
  });

  it("lists no code the API can't return", () => {
    const anywhere = errorsIn([
      ...thrown,
      // assertBindableDomains (custom domains on codes)
      "app/(app)/dashboard/domains/_lib/domains.ts",
    ]);
    // lib/error-response's own: ValidationError, UnauthorizedError, crashes.
    for (const own of [
      "400 VALIDATION_ERROR",
      "401 UNAUTHORIZED",
      "500 INTERNAL_ERROR",
    ]) {
      anywhere.add(own);
    }
    expect([...catalogued].filter((e) => !anywhere.has(e))).toEqual([]);
  });

  it("is on the errors page, each code with its status", () => {
    const page = read("content/docs/developers/errors.mdx");
    for (const { code, status } of API_ERRORS) {
      expect(page, `${status} ${code}`).toMatch(
        new RegExp(`\\|\\s*${status}\\s*\\|\\s*\`${code}\`\\s*\\|`),
      );
    }
  });

  it("stays out of the running app (it gives app schemas registry ids)", () => {
    const importers = [
      ...walk("app"),
      ...walk("components"),
      ...walk("lib"),
      "proxy.ts",
    ].filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) &&
        !file.startsWith(join("lib", "openapi")) &&
        /from "@\/lib\/openapi\/(document|schemas)"/.test(read(file)),
    );
    expect(importers).toEqual([]);
  });
});
