# @repo/i18n

The languages QRdx is translated into, which pages exist in each one and at what URL, the rules for the docs in other languages, and a copy of the messages the docs read. Plain TypeScript with no React, no environment access and no runtime dependencies, so client components, server code, `next.config.ts` and another app can all import it.

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
| `docs.ts` (`@repo/i18n/docs`) | The docs' languages and URLs, `translatedDocsSegments()`, the docs rewrites for `next.config.ts`, and `docsI18nOptions` for fumadocs' `defineI18n()` |
| `docs-meta.ts` (`@repo/i18n/docs-meta`) | The docs sidebar in other languages: the English structure with translated labels |
| `docs-search.ts` (`@repo/i18n/docs-search`) | The docs search tokenizer for each language |
| `docs-seo.ts` (`@repo/i18n/docs-seo`) | Canonicals, `noindex`, hreflang and sitemap entries for docs pages; `createDocsSeo(baseUrl)` gives the helpers that write absolute URLs |
| `messages.ts` (`@repo/i18n/messages`) | `mergeMessages`, `pickMessages`, `CHROME_NAMESPACES`, and `DOCS_NAMESPACES`, the namespaces copied for the docs |
| `docs-messages.ts` (`@repo/i18n/docs-messages`), `messages/<locale>.json` | The docs' catalogs: `loadDocsMessages(locale)` (English under each translation) and the `DocsMessages` type |
| `index.ts` (`@repo/i18n`) | `config`, `paths`, `docs` and `review` together |

## The docs' messages

`apps/docs/messages` stays the only place anyone edits copy. `messages/<locale>.json` here is a copy of the namespaces the docs read (`DOCS_NAMESPACES`: `docs`, `footer`, `localeSwitcher`, `meta`, `consent`), written by `bun run --filter docs i18n:docs-messages` (`apps/docs/lib/i18n/docs-messages.ts`). `i18n:translate` and `i18n:extract` write it after they save, `i18n:check` fails while it's out of date, and `apps/docs/tests/i18n/i18n-package.test.ts` checks that it matches, that it loads like the app's catalogs, and that every namespace the docs' code reads is in `DOCS_NAMESPACES`.

## How the app uses it

- `apps/docs/lib/i18n/{config,paths,routing,review,docs,docs-meta,docs-search,docs-seo,messages}.ts` keep the app's import paths. Three add something of the app's: `docs.ts` builds `docsI18n` with fumadocs, `docs-seo.ts` gives the URL helpers the app's origin (`lib/metadata.ts`), and `messages.ts` loads the full catalogs.
- `next.config.ts` imports `@repo/i18n/docs` and `@repo/i18n/routing` directly. Next compiles the config with the app's tsconfig paths, and a file in a subfolder of the app (such as `lib/i18n/routing.ts`) that imports `@repo/*` can't be resolved there, so modules this config loads use relative imports only.
