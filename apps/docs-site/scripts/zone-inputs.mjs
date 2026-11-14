#!/usr/bin/env node
// What the docs build reads from the main app, written before every dev
// server, build, typecheck and test (package.json), and nowhere committed,
// so none of it can go stale between merges:
//
// 1. packages/config/facts.generated.json, the product facts snapshot
//    (`bun run --filter docs facts:snapshot`, from apps/docs/lib/
//    product-facts.ts), which lib/product-facts.ts reads.
// 2. packages/i18n/messages/<locale>.json, the namespaces of the message
//    catalogs the docs read (`bun run --filter docs i18n:docs-messages`,
//    DOCS_NAMESPACES in @repo/i18n), which lib/i18n/messages.ts loads.
// 3. packages/docs-assets/openapi.json, a copy of the main app's OpenAPI
//    document (`bun run --filter docs openapi:export`), which the API
//    reference pages render (lib/api-reference.ts).
// 4. generated/zone-availability.json: the main app's
//    ${MAIN_ZONE_URL}/zone/availability.json, which lib/feature-availability.ts
//    reads for <IfAvailable> and the sidebar. When it can't be fetched
//    (MAIN_ZONE_URL unset, offline, a CI run), the file says so and the docs
//    treat every gated feature as unavailable. With
//    DOCS_REQUIRE_AVAILABILITY=1 (the deploy workflow) a failed fetch fails
//    the build instead.
//
// Nothing here prints a variable's value: only the URL's origin, which is
// public.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(app, "..", "..");
const AVAILABILITY_PATH = "/zone/availability.json";
const OUT = join(app, "generated", "zone-availability.json");

/** Runs one of the main app's scripts that write a generated input. */
function mainAppScript(script, what) {
  const result = spawnSync("bun", ["run", "--filter", "docs", script], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(
      `zone-inputs: ${what} failed (bun run --filter docs ${script}).`,
    );
    process.exit(result.status ?? 1);
  }
}

/** The shape lib/zone-availability.ts checks, enough to catch an error page. */
function isPublishedAvailability(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    ["available", "unavailable", "hiddenPaths", "hiddenIntegrations"].every(
      (key) =>
        Array.isArray(value[key]) &&
        value[key].every((item) => typeof item === "string"),
    )
  );
}

async function fetchAvailability() {
  const base = process.env.MAIN_ZONE_URL;
  const required = process.env.DOCS_REQUIRE_AVAILABILITY === "1";
  const fallback = (reason) => {
    if (required) {
      console.error(
        `zone-inputs: ${reason}. DOCS_REQUIRE_AVAILABILITY=1, so the build stops.`,
      );
      process.exit(1);
    }
    console.warn(
      `zone-inputs: ${reason}. The docs treat every gated feature as unavailable.`,
    );
    return { source: null, availability: null };
  };

  if (!base) return fallback("MAIN_ZONE_URL is not set");
  let url;
  try {
    url = new URL(AVAILABILITY_PATH, base);
  } catch {
    return fallback("MAIN_ZONE_URL is not a URL");
  }
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return fallback(
        `${url.origin}${AVAILABILITY_PATH} answered ${response.status}`,
      );
    }
    const availability = await response.json();
    if (!isPublishedAvailability(availability)) {
      return fallback(
        `${url.origin}${AVAILABILITY_PATH} isn't an availability document`,
      );
    }
    console.log(
      `zone-inputs: read ${url.origin}${AVAILABILITY_PATH} (${availability.available.length} features on).`,
    );
    return { source: `${url.origin}${AVAILABILITY_PATH}`, availability };
  } catch (error) {
    return fallback(
      `couldn't fetch ${url.origin}${AVAILABILITY_PATH} (${error instanceof Error ? error.name : "error"})`,
    );
  }
}

mainAppScript("facts:snapshot", "the product facts snapshot");
mainAppScript("i18n:docs-messages", "the docs' message catalogs");
mainAppScript("openapi:export", "the OpenAPI document's copy");
const file = await fetchAvailability();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
