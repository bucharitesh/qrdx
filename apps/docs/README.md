# apps/docs

The QRdx docs as a Next.js app of their own: the docs zone of qrdx.dev. Readers never see its own host. The main app (`apps/app`) proxies the docs' URLs here once its `DOCS_ZONE_URL` is set, so every URL stays the same: `/docs/...`, `/<lang>/docs/...`, the `.md` and `.mdx` copies, `/llms.mdx/...`, `/docs-md/...`, `/og/docs/...`, `/api/search` and `/llms-full.txt`. The routing rules live in `@repo/i18n/docs` (`docsZoneRewrites`, `isDocsPagePath`), the manifest contract in `@repo/next-config/docs-zone`.

The pages are in `content/docs` (MDX: each English `<page>.mdx` with its translations, `<page>.<locale>.mdx`, beside it), and the review records of the translations in `content/review/<locale>.json`. The main app's scripts write some of them: `bun run --filter app i18n:docs` the translations (CONTRIBUTING.md, "Translating QRdx") and `bun run --filter app openapi:generate` the API reference (`content/docs/developers/api`, `developers/errors.mdx`).

Without `DOCS_ZONE_URL` (self-hosting, or local development without this app), the main app has no docs: it redirects every docs URL to the same path on qrdx.dev (`docsOriginRedirects` in `@repo/i18n/docs`), lists no docs in its sitemap, links the docs on qrdx.dev from its llms.txt, and leaves docs out of its command menu's search.

## Run it

```bash
cp apps/docs/.env.example apps/docs/.env.local
bun run --filter docs dev        # http://localhost:3001
bun run --filter docs test
bun run --filter docs typecheck
bun run --filter docs seo:dates  # from a full clone: lib/seo-file-dates.json
```

To see it through the main app as readers will, run the main app with `DOCS_ZONE_URL=http://localhost:3001` in `apps/app/.env.local`.

`lib/seo-file-dates.json` holds each English page's last change from the full git history, for builds from a shallow clone (`lib/seo-dates.ts`). Git dates follow moves: a page keeps its date when its file is only moved.

## What it reads from the main app

`scripts/zone-inputs.mjs` runs before `dev`, `build`, `typecheck` and `test`, and writes every generated input (none of them is committed):

- the product facts snapshot (`bun run --filter app facts:snapshot` writes `packages/config/facts.generated.json` from `apps/app/lib/product-facts.ts`), for `{facts.…}` in the docs;
- the docs' message catalogs (`bun run --filter app i18n:docs-messages` writes the `DOCS_NAMESPACES` of `apps/app/messages` to `packages/i18n/messages`), which `lib/i18n/messages.ts` loads;
- the OpenAPI document's copy (`bun run --filter app openapi:export` writes `packages/docs-assets/openapi.json`), for the API reference pages;
- `${MAIN_ZONE_URL}/zone/availability.json` into `generated/zone-availability.json`, for `<IfAvailable>` and the sidebar (`lib/zone-availability.ts`). When it can't be fetched, every feature that needs setup counts as unavailable; with `DOCS_REQUIRE_AVAILABILITY=1` (the deploy workflow) the build stops instead.

The tests also read the main app's `lib/docs-redirects.ts`, whose redirects must land on docs pages here. The shared code comes from packages: `@repo/i18n` (languages, URLs, docs SEO), `@repo/analytics` (consent and analytics), `@repo/docs-assets` (registry, pattern catalog, catalogue tiles), `@repo/design-system`, `@repo/config` and `@repo/availability`.

## What it gives the main app

`/zone/docs-manifest.json`: the docs' sitemap entries (with hreflang, as `lib/i18n/docs-seo.ts` decides) and the docs sections in sidebar order. With `DOCS_ZONE_URL` set, the main app's `/sitemap.xml`, `/llms.txt` and `/index.md` read it hourly.

## How it differs from the main app

- No database, no auth and no server actions. Analytics and the cookie banner (`@repo/analytics`) work as on the main app's pages, without the plan lookup; the session sync asks the main app (same origin). The docs site records its own pages only (`lib/analytics/privacy.ts`), and its privacy policy links are plain `<a>` elements.
- `lib/metadata.ts` writes every absolute URL against `NEXT_PUBLIC_APP_URL` (qrdx.dev), never against this project's own domain.
- `ZoneLink` (`components/zone-link.tsx`): next/link for docs pages, a plain `<a>` for every other page, which belongs to the main app. `LocaleLink` and `useLocaleRouter` go through it.
- `assetPrefix: "/docs-static"`, so the main app can proxy this app's `/_next` files without clashing with its own.
- `robots.txt` disallows everything: only this app's own host serves it.

## Deploys

`.github/workflows/docs-deploy.yml` builds on GitHub's runner and deploys the prebuilt output to its own Vercel project (`vercel.json` turns off Vercel's Git deployments), on pushes to `main` that touch the docs, or by hand.
