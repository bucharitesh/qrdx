# docs-site

The QRdx docs as a Next.js app of their own: the docs zone of qrdx.dev. Readers never see its own host. The main app (`apps/docs`) proxies the docs' URLs here once its `DOCS_ZONE_URL` is set, so every URL stays the same: `/docs/...`, `/<lang>/docs/...`, the `.md` and `.mdx` copies, `/llms.mdx/...`, `/docs-md/...`, `/og/docs/...`, `/api/search` and `/llms-full.txt`. The routing rules live in `@repo/i18n/docs` (`docsZoneRewrites`, `isDocsPagePath`), the manifest contract in `@repo/next-config/docs-zone`.

Until the cut-over the main app still serves its own copy of the docs, and this app is a copy of that code. The content stays in `apps/docs/content/docs`, where the translation scripts write it; `source.config.ts` compiles it from there.

## Run it

```bash
cp apps/docs-site/.env.example apps/docs-site/.env.local
bun run --filter docs-site dev        # http://localhost:3001
bun run --filter docs-site test
bun run --filter docs-site typecheck
```

To see it through the main app as readers will, run the main app with `DOCS_ZONE_URL=http://localhost:3001` in `apps/docs/.env.local`.

## What it reads from the main app

`scripts/zone-inputs.mjs` runs before `dev`, `build`, `typecheck` and `test`:

- the product facts snapshot (`bun run --filter docs facts:snapshot` writes `packages/config/facts.generated.json` from `apps/docs/lib/product-facts.ts`), for `{facts.…}` in the docs;
- `${MAIN_ZONE_URL}/zone/availability.json` into `generated/zone-availability.json`, for `<IfAvailable>` and the sidebar (`lib/zone-availability.ts`). When it can't be fetched, every feature that needs setup counts as unavailable; with `DOCS_REQUIRE_AVAILABILITY=1` (the deploy workflow) the build stops instead.

It also reads the message catalogs from `apps/docs/messages`, the recorded file dates from `apps/docs/lib/seo-file-dates.json`, and the OpenAPI document, registry sources, pattern catalog and catalogue tiles from `@repo/docs-assets`.

## What it gives the main app

`/zone/docs-manifest.json`: the docs' sitemap entries (with hreflang, as `lib/i18n/docs-seo.ts` decides) and the docs sections in sidebar order. With `DOCS_ZONE_URL` set, the main app's `/sitemap.xml`, `/llms.txt` and `/index.md` read it hourly.

## How it differs from the main app's copy

- No database, no auth and no server actions. Analytics and the cookie banner work as on the main app's pages, without the session sync: PostHog keeps the identity the main app's pages set.
- `lib/metadata.ts` writes every absolute URL against `NEXT_PUBLIC_APP_URL` (qrdx.dev), never against this project's own domain.
- `ZoneLink` (`components/zone-link.tsx`): next/link for docs pages, a plain `<a>` for every other page, which belongs to the main app. `LocaleLink` and `useLocaleRouter` go through it.
- `assetPrefix: "/docs-static"`, so the main app can proxy this app's `/_next` files without clashing with its own.
- `robots.txt` disallows everything: only this app's own host serves it.

## Deploys

`.github/workflows/docs-deploy.yml` builds on GitHub's runner and deploys the prebuilt output to its own Vercel project (`vercel.json` turns off Vercel's Git deployments), on pushes to `main` that touch the docs, or by hand.
