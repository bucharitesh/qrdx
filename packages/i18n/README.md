# @repo/i18n

The languages QRdx is translated into, which pages exist in each one and at what URL, the rules for the docs in other languages, and a loader for the messages the docs read. Plain TypeScript with no React, no environment access and no runtime dependencies, so client components, server code, `next.config.ts` and another app can all import it.

```ts
import { LOCALES, localeFromSegment } from "@repo/i18n/config";
import { localizeHref } from "@repo/i18n/paths";

localizeHref("/pricing", "es"); // "/es/pricing"
```

| Module | What it holds |
| --- | --- |
| `config.ts` (`@repo/i18n/config`) | `LOCALE_CONFIG`, the languages: URL segment, names, hreflang, `og:locale`, direction, review state, and whether the docs are translated. Adding a language starts here (CONTRIBUTING.md, "Translating QRdx") |
| `paths.ts` (`@repo/i18n/paths`), `localized-paths.json` | The translated pages (`localized-paths.json`, by route path) and `localizePath`, `localizeHref`, `splitLocale` |
| `routing.ts` (`@repo/i18n/routing`) | The `next.config.ts` rewrites and redirects that give English its unprefixed URLs |
| `review.ts` (`@repo/i18n/review`) | The native review gate: which pages search engines may index in each language |
| `docs.ts` (`@repo/i18n/docs`) | The docs' languages and URLs, `translatedDocsSegments()`, the docs rewrites for `next.config.ts`, `docsI18nOptions` for fumadocs' `defineI18n()`, and the docs zone's routing: `docsZoneRewrites()` (the main app's rewrites to the docs site at `DOCS_ZONE_URL`) and `isDocsPagePath()` (which links stay inside the docs site) |
| `docs-meta.ts` (`@repo/i18n/docs-meta`) | The docs sidebar in other languages: the English structure with translated labels |
| `docs-search.ts` (`@repo/i18n/docs-search`) | The docs search tokenizer for each language |
| `docs-seo.ts` (`@repo/i18n/docs-seo`) | Canonicals, `noindex`, hreflang and sitemap entries for docs pages; `createDocsSeo(baseUrl)` gives the helpers that write absolute URLs |
| `messages.ts` (`@repo/i18n/messages`) | `mergeMessages`, `pickMessages`, `CHROME_NAMESPACES`, and `DOCS_NAMESPACES`, the namespaces copied for the docs, with `DOCS_MESSAGES_COMMAND`, which writes the copy |
| `docs-messages.ts` (`@repo/i18n/docs-messages`) | `loadDocsMessages(locale)`: the docs' catalog in a language, over English, read from `messages/<locale>.json` (written before use, not committed) |
| `index.ts` (`@repo/i18n`) | `config`, `paths`, `docs` and `review` together |

## The docs' messages

`apps/app/messages` stays the only place anyone edits copy. An app that can't import `apps/app` reads the namespaces the docs use (`DOCS_NAMESPACES`: `docs`, `footer`, `localeSwitcher`, `meta`, `consent`) from `messages/<locale>.json` here, which `bun run --filter app i18n:docs-messages` (`apps/app/lib/i18n/docs-messages.ts`) writes. The folder is gitignored: that app runs the command right before it builds or starts, like `facts:snapshot` for `@repo/config/facts`, so the copy is always made from the current catalogs and can't go stale between merges. `loadDocsMessages` throws, naming the command, when a file is missing.

`apps/app/tests/i18n/i18n-package.test.ts` builds the copy in memory and checks that it loads like the app's catalogs; `apps/docs/tests/i18n/docs-namespaces.test.ts` checks that every namespace the docs' code reads is in `DOCS_NAMESPACES`.

## How the app uses it

- The main app imports the package directly (`@repo/i18n/config`, `@repo/i18n/paths`, …). Its own `lib/i18n/messages.ts` loads the full catalogs; the docs site's `lib/i18n/docs.ts` builds `docsI18n` with fumadocs and its `lib/i18n/docs-seo.ts` gives the URL helpers qrdx.dev's origin.
- `next.config.ts` imports `@repo/i18n/docs` and `@repo/i18n/routing` directly. Next compiles the config with the app's tsconfig paths, and a file in a subfolder of the app that imports `@repo/*` can't be resolved there, so modules this config loads use relative imports only.
