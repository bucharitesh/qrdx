# Contributing to QRdx

Thanks for your interest in contributing. This guide covers local setup, the project layout, the checks to run before opening a pull request, and how we review changes.

Not sure where to start? See [Good first issues](#good-first-issues) below. For questions, use [Q&A in Discussions](https://github.com/bucharitesh/qrdx/discussions/categories/q-a), and [SUPPORT.md](SUPPORT.md) lists where everything else goes. To report a security problem, follow [SECURITY.md](SECURITY.md) instead of opening a public issue. If you work with a coding agent, [AGENTS.md](AGENTS.md) has the short version of this guide and the rules that are easy to break.

## Prerequisites

- Node.js 22, version 22.22.3 or later (CI, Docker and production run Node 22)
- [Bun](https://bun.com/docs/installation) 1.4 to install dependencies and run scripts (the exact version is pinned in `package.json` under `packageManager`); the app, its tests and its builds run on Node.js
- A Postgres database for the web app: a free [Neon](https://neon.tech) database, or the Docker Compose Postgres described below

You don't need a database or any environment variables to work on the React library (`packages/qrdx`) or the CLI (`packages/cli`).

## Local setup

1. **Fork and clone**

   Work happens on the `staging` branch. `main` is what runs on qrdx.dev, so branch from `staging`:

   ```bash
   git clone https://github.com/<your-username>/qrdx.git
   cd qrdx
   git remote add upstream https://github.com/bucharitesh/qrdx.git
   git fetch upstream staging
   git checkout -b my-change upstream/staging
   ```

2. **Install dependencies and build the engine**

   ```bash
   bun install
   bun run --filter qrdx build:inplace
   ```

   The app imports the QR engine from `packages/qrdx/dist`, so build it once after installing, and again with `build:inplace` after you change `packages/qrdx/src`. Git hooks rebuild it for you when a pull, rebase or branch switch changes the engine (set `QRDX_SKIP_ENGINE_REBUILD=1` to skip that). Don't run `bun run build` inside `packages/qrdx` while the dev server is running: it deletes `dist/` first, and the app breaks until the build finishes.

   To add a dependency, run `bun add <package>` (`bun add -d` for a dev dependency) in the folder of the package that imports it, and commit the updated `bun.lock`. Each package only sees the dependencies its own `package.json` lists.

3. **Configure the environment**

   Next.js loads env files from the app directory, so copy the example there:

   ```bash
   cp .env.example apps/docs/.env.local
   echo 'DATABASE_URL=<your connection string>' > packages/database/.env
   ```

   In `apps/docs/.env.local`, set the three required values (`NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`). To sign in locally, also add a [GitHub OAuth app](https://github.com/settings/developers) with the callback URL `http://localhost:3000/api/auth/callback/github`. Every other variable is optional, and `.env.example` explains each one.

4. **Set up the database**

   With Neon:

   ```bash
   bun run db:push
   ```

   `bun run db:push` changes whatever database `DATABASE_URL` points at. Only run it against a development database of your own that you can throw away, never a shared or production one.

   Or with Postgres in Docker:

   ```bash
   docker compose up -d db db-proxy
   docker compose run --rm migrate
   ```

   then add these lines to `apps/docs/.env.local`:

   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qrdx
   DATABASE_HTTP_ENDPOINT=http://localhost:4444/sql
   ```

5. **Run the app**

   ```bash
   bun run --filter docs dev
   ```

   Open http://localhost:3000. On a fresh clone, run `bun run typegen:docs` once before your first typecheck (the pre-push hook also runs it). Without `apps/docs/.env.local` it uses the same placeholder settings as CI.

## Project structure

| Path | What it is |
| --- | --- |
| `apps/docs` | The Next.js app behind qrdx.dev: marketing pages, the editor (`app/(app)/playground`), docs (`content/docs`), the blog, the signed-in app (`app/(app)/dashboard`, `app/(app)/settings`), admin, and the API routes (`app/api`, served as `api.qrdx.dev/v1` and `mcp.qrdx.dev/mcp`) |
| `packages/qrdx` | The QR engine and React library, published to npm as `qrdx` |
| `packages/cli` | The command-line tool, published to npm as `@qrdx/cli` |
| `packages/auth` | Better Auth server and client configuration |
| `packages/database` | Drizzle schema (`schema.ts`), the database client, and hand-applied SQL (`manual-sql/`) |
| `packages/design-system` | Shared UI components (shadcn/ui), icons, styles and fonts |
| `packages/integrations`, `packages/integration-kit` | The integrations catalogue (`src/catalog`), the connected-account integrations (`src/integrations`) and the shared integration types |
| `packages/rate-limit` | Upstash-based rate limiting |
| `packages/next-config`, `packages/typescript-config` | Shared Next.js config and env keys, shared tsconfig presets |
| `plugins/chrome`, `plugins/figma`, `plugins/raycast`, `plugins/canva` | The Chrome extension, Figma plugin, Raycast extension and Canva app |
| `skills/` | Agent skills, such as `generate-qr` |

## Checks before you open a pull request

CI (`.github/workflows/ci.yml`) runs these on every pull request and on every push to `main`. Pushes to `staging` don't run it again: every change reaches `staging` through a pull request that already did. Both branches require the job to pass before anything merges.

```bash
bun x turbo build --filter=qrdx --filter=@qrdx/cli   # the docs app and CLI use qrdx's build output; the CLI tests run its dist/index.js
bun run typecheck                   # all packages with a typecheck script
bun run typegen:docs && bun run typecheck:docs   # route types (PageProps, LayoutProps), then the app typecheck
bun run --filter docs i18n:check    # translations against English (see Translating QRdx)
bun run test                        # every package's tests, through turbo
bun run lint:ci                     # ultracite check: Biome's lint and format rules over the whole repository
```

A pull request into `staging` tests only the packages it changes and the packages that depend on them (`turbo test --affected`). A content-only change runs the docs app's tests and skips the engine's; a change to `packages/qrdx` runs the engine, the CLI and the docs app. Release pull requests into `main`, pushes to `main` and manual runs test everything. Turbo's cache (`.turbo/cache`, kept between runs with `actions/cache`) replays any task whose inputs haven't changed, and the job's summary lists what was replayed and what ran.

The official frames (`packages/qrdx/src/frames/official`, hundreds of them) all get their spec, color, layout and generator checks and one crisp decode on every run, but the slow scan checks (the phone-camera model at three distances, 160 and 320 px, the scan score, zbar, PDF and EPS) only go to a sample: the hand-made frames, one frame per layout, and a set that rotates daily so every frame comes round (`packages/qrdx/scripts/official-frames/sample.mjs`). To scan every frame, as the weekly and release `Frame scan` workflow does, set `QRDX_FULL_FRAME_SCAN=1`:

```bash
cd packages/qrdx && QRDX_FULL_FRAME_SCAN=1 bun x vitest run tests/official-frames tests/frame-label-markers.test.ts
cd apps/docs && QRDX_FULL_FRAME_SCAN=1 bun x vitest run tests/database/seed-frames-gate-1.test.ts tests/database/seed-frames-gate-2.test.ts
```

`QRDX_FRAME_SCAN_DAY=<n>` replays the sample a failing run named ("day n").

The Husky `pre-push` hook runs `bun run prepush:quick`: the engine build, both typechecks, the lint check and the affected tests, compared with `origin/staging`. Run every test with `QRDX_PREPUSH=full git push` or `bun run prepush`, or skip the hook once with `git push --no-verify`.

To auto-fix formatting, import order and the lint rules that have a safe fix in the files you changed, run this from the repository root:

```bash
bun x ultracite fix <files>
```

### Tests

| Suite | Where | Run |
| --- | --- | --- |
| Unit and integration (Vitest) | `apps/docs/tests/**`, `packages/*/tests` | `bun run --filter docs test:unit`, or `bun run test` for the monorepo |
| node:test suites next to the code | `apps/docs/**/*.test.ts` outside `tests/` and `e2e/` | `bun run --filter docs test:node` |
| Playground e2e | `apps/docs/e2e/playground.e2e.ts` | `bun run --filter docs test:e2e` |
| Signed-in app e2e | `apps/docs/e2e/app.e2e.ts` | `bun run --filter docs test:e2e:app` (needs a session cookie, below) |
| Public site e2e | `apps/docs/e2e/site.e2e.ts` | `bun run --filter docs test:e2e:site` |

`bun run prepush` runs the first two. They need no database, network or email: route handlers run against an in-memory database (`apps/docs/tests/support/fake-db.ts`) that evaluates the app's real Drizzle queries. A known bug can be recorded as `it.fails` with a `// BUG (file): …` comment until it's fixed.

Run these through `bun run`. `bun test` is Bun's own test runner, and these Vitest and `node:test` suites aren't written for it.

The e2e suites drive headless Chrome over the DevTools Protocol, so they need Chrome (or `CHROME_PATH`) and a running dev server (`bun run --filter docs dev`). They aren't part of `bun run prepush`. Each one exits 0 with a notice when the server or Chrome is missing. `E2E_BASE_URL` points them at another server, and `E2E_SUITES` runs some of their areas, for example `E2E_SUITES=oauth,webhooks` or `E2E_SUITES=image,mcp`.

The app suite signs in with a test account's Better Auth session cookie. Sign in to your local app with a throwaway account, copy the `better-auth.session_token` cookie, and pass it as `E2E_SESSION_COOKIE='better-auth.session_token=<value>'` or put that pair in a file named by `E2E_COOKIE_FILE`. Never commit it. The suite creates codes, a folder, a tag, a hosted page, an OAuth app and (on Business) a webhook, all named `E2E …`, under that account and deletes them again. Webhook URLs only ever point at `https://example.com`.

### Database changes

Edit `packages/database/schema.ts` and apply it to your own development database with `bun run db:push`.

A maintainer applies schema changes to the production database before the code that needs them ships, so the code already running has to keep working against the new schema. That means schema changes are additive and safe to run twice: new columns are nullable or have a default, and a pull request never drops or renames a column or table. Put the SQL for your change in `packages/database/manual-sql/`, numbered after the last file there and guarded so it can run more than once (`IF NOT EXISTS`), and describe it in your pull request.

## Translating QRdx

English is the source and keeps the unprefixed URLs (`/pricing`). Every other language lives under its own lowercase segment: `/es/pricing`, `/pt-br/pricing`, `/zh-hans`. Translated so far: the header, the footer, the cookie banner and its dialog, the home page, `/pricing` and the other marketing pages listed in `apps/docs/lib/i18n/localized-paths.json` (tools, scanner, generators, industry and placement guides, templates, integrations, plugins, MCP, AI and the comparison index). A dynamic route is listed the way its folder is named (`/qr-code-generator/[type]`). The docs are also in Spanish, Brazilian Portuguese, Japanese and Simplified Chinese (see [Docs](#docs) below). The blog, the legal pages, the comparison pages themselves and the signed-in app are English only.

The copy is in `apps/docs/messages/`:

| File | What it holds |
| --- | --- |
| `en.json` | The English source: every key, with ICU placeholders such as `{count}` |
| `<locale>.json` | One language's translations of those keys. A missing key shows in English |
| `review/<locale>.json` | For each translated string, a hash of the English it came from and its status, `machine` or `reviewed` |
| `glossary.json` | Names that are never translated (`keep`), fixed translations per language (`fixed`) and each language's tone (`register`) |
| `content/<locale>.json` | Translations of copy that lives in TypeScript data (generator pages, industry and placement guides, FAQ lists), keyed by a hash of the English, with the English beside each one |

Long copy kept in TypeScript (for example `lib/qr-types-content.ts`, `lib/seo-content`, a page's `content.ts`) stays English in its file. `apps/docs/lib/i18n/content-sources.ts` lists that data, the translate script fills `content/<locale>.json` from it, and pages render it with `localizeContent()` (client components with `useContentText()`). A string is looked up by its English, so when the English changes it shows in English until it's translated again.

### Add a language

Open an issue first, so two people don't start the same language. A new language touches these files and nothing else:

1. `apps/docs/lib/i18n/config.ts`: one entry in `LOCALE_CONFIG`. The key is the BCP 47 code (`nl`, `zh-Hant`). Give it the lowercase URL `segment`, its `name` written in the language itself, its `englishName`, the `hreflang` values, `ogLocale`, `dir` (`"rtl"` for Arabic, Hebrew or Persian) and `review: "machine"`.
2. `apps/docs/messages/<code>.json`: the translations. It can start as `{}`, and a partial file is fine to merge, because untranslated strings show in English.
3. `apps/docs/messages/review/<code>.json`: written by the translate script (below). Don't edit the hashes by hand.
4. `apps/docs/messages/glossary.json` (optional): the language's fixed terms under `fixed`, such as the Free plan's name, and its tone under `register`.

Routes, the language menu, `<html lang>` and `<html dir>`, page metadata and the sitemap read the config, so nothing else needs editing. A right-to-left language renders with `dir="rtl"`, but the layout hasn't been converted yet (logical CSS properties, mirrored icons, a font for the script). That work has its own issue.

### Translate

By hand: copy the keys you're translating from `en.json` into `<code>.json`, keeping the same nesting. Then record them, so a later change to the English shows up as stale:

```bash
bun run --filter docs i18n:translate --locale <code> --record
```

With a model: the script translates missing and stale strings through Vercel AI Gateway. Each request carries the glossary, the key, the page the string appears on and a length budget for short labels. The script checks every answer and keeps the English for any that fail. QRdx's gateway key isn't shared, so use your own:

```bash
AI_GATEWAY_API_KEY=<your key> bun run --filter docs i18n:translate --locale <code>
I18N_MODEL=<gateway model id> AI_GATEWAY_API_KEY=<your key> bun run --filter docs i18n:translate --locale <code>
```

It translates both catalogs; `--only ui` or `--only content` picks one, `--concurrency <n>` sets the requests at a time (3 by default) and `--prune` drops content translations no page uses any more. Work is saved after every request, so an interrupted run keeps what it finished.

Read the result before you open the pull request. Machine output gets the same review as a hand translation.

The rules for every string:

- Keep placeholders and tags exactly as they are (`{count}`, `{count, plural, one {…} other {…}}`, `<link>…</link>`) and translate only the words around and inside them.
- Keep every number the English states, written in Western digits. Add no feature, number, promise or adjective the English doesn't have.
- Leave the names in the glossary's `keep` list in English: QRdx, Pro, Business, Never-Hostage, file formats and product names. The Free plan's name is translated.
- Follow the language's `register`, and keep buttons and labels about as short as the English.
- Legal pages stay in English, and links to them stay as they are.

### Check

```bash
bun run --filter docs i18n:check            # CI runs this
bun run --filter docs i18n:check --verbose  # also lists missing, unrecorded and stale strings
```

It fails on keys that English doesn't have, on placeholders or tags that changed, and on numbers that went missing. In a language that isn't reviewed yet, missing and stale strings only produce warnings. Also open `/<segment>` and `/<segment>/pricing` and attach screenshots at 1440 px and 390 px to the pull request; long German or Finnish words are the usual overflow.

### Docs

The docs (`apps/docs/content/docs`) are translated into the languages whose entry in `lib/i18n/config.ts` has `docs: true`: today `es`, `pt-BR`, `ja` and `zh-Hans`. Their pages live at `/es/docs/...`, `/pt-br/docs/...`, `/ja/docs/...` and `/zh-hans/docs/...`; English keeps `/docs/...`. Other languages link to the English docs.

| File | What it holds |
| --- | --- |
| `content/docs/<page>.<code>.mdx` | A page's translation, beside the English `<page>.mdx` |
| `content/docs/<folder>/meta.<code>.json` | The folder's sidebar labels: tab and folder names, separators |
| `messages/review/docs/<code>.json` | For each English file, a hash of the English the translation came from and its status, `machine` or `reviewed` |
| `messages/<code>.json`, key `docs` | The docs interface: search, table of contents, page buttons, the language menu, the 404 page |

A page that isn't translated shows the English text at the language's URL, with a note saying so. The sidebar's structure always comes from the English `meta.json`; a translated `meta.<code>.json` only supplies labels. So a new English page shows up in every language's sidebar right away, in English, until someone translates it. The API reference (`developers/api`) stays English: it's generated from the OpenAPI document.

Translate missing and stale pages with a model (same key as above):

```bash
AI_GATEWAY_API_KEY=<your key> bun run --filter docs i18n:docs --locale <code>
bun run --filter docs i18n:docs --locale <code> --page help/   # one folder
```

The script sends prose only. Code blocks, imports and component expressions are swapped out first, and every answer is checked: the same code, inline code, link URLs, `{facts.…}` tokens, components and their props, headings, lists, table rows and numbers, and valid MDX. Headings keep their English anchors (`## Título [#title]`), so links to `#section` work in every language. A page that fails three times stays English, and the script lists it.

By hand: write `<page>.<code>.mdx` with the same frontmatter keys, translating `title` and `description`, and leave code, URLs, `{facts.…}` tokens and component props other than `title`, `description`, `label` and `alt` as they are. Then record it with `bun run --filter docs i18n:docs --locale <code> --record`. Links to other docs pages keep their English URL (`/docs/...`): the page points them at the reader's language.

`i18n:check` lists, per language, how many pages are translated, reviewed, machine-made, stale (the English changed since) or still English.

### Review and search engines

A language with `review: "machine"` is live on the site but hidden from search engines. Its pages are `noindex`, they're left out of the sitemap, and no page links to them with hreflang. To publish a language, a native speaker reads every string, sets each one's `status` to `"reviewed"` in `review/<code>.json`, and changes the language's `review` to `"reviewed"` in the config. From the next deploy its pages are indexed, listed in the sitemap and linked with hreflang. `i18n:check` then fails on any string in that language that is missing, machine-made or stale. To publish single pages first, set `review` to a list of paths, such as `["/", "/pricing"]`.

Docs pages follow the same `review`: a list can name docs paths (`"/docs/help"`), and `"reviewed"` publishes every translated docs page. Before that, a native speaker sets each page's `status` to `"reviewed"` in `review/docs/<code>.json`; `i18n:check` fails on a published docs page that is machine-made or stale. A page that isn't translated is never indexed: it carries `noindex` and a canonical link to the English page.

## Pull requests

- Open pull requests against `staging`, not `main`. Changes collect on `staging`; a workflow keeps a release pull request from `staging` to `main` up to date, and merging that one ships to qrdx.dev.
- Keep each pull request focused on a single change.
- Use a [Conventional Commits](https://www.conventionalcommits.org/) style title, for example `feat(editor): add frame presets` or `fix(cli): handle missing sharp`.
- Fill in the pull request template. For UI changes, include before and after screenshots at 1440 px and 390 px wide, in light and dark mode.
- Keep secrets out of code, tests, screenshots and logs: no `.env` values, tokens or session cookies. Tests use the fakes in `apps/docs/tests/support/`.
- Copy on the site goes live as written, so no placeholders or "TBD". Product counts come from code (`apps/docs/lib/product-facts.ts` and the catalogues), not typed by hand.
- Update the docs (`apps/docs/content/docs`) or package READMEs when you change behavior or public APIs.
- Make sure the checks above pass. A maintainer reviews every pull request before it's merged.

## Good first issues

Issues labeled [`good first issue`](https://github.com/bucharitesh/qrdx/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are small and self-contained, and [`help wanted`](https://github.com/bucharitesh/qrdx/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) marks bigger ones where help is welcome. Comment on the issue before you start, so two people don't build the same thing. The `area: …` labels tell you which part of the repository an issue is about.

When nothing is open under those labels, docs fixes are a good first pull request: the **Open** menu under each docs page's title has **Open in GitHub**, which takes you to the page's source in `apps/docs/content/docs`. Or ask in [Q&A](https://github.com/bucharitesh/qrdx/discussions/categories/q-a) what would help most.

By contributing, you agree that your contributions are licensed under the project's [AGPL-3.0-or-later license](LICENSE), or under the MIT license for files in folders with their own MIT `LICENSE` (`packages/qrdx`, `packages/cli`, `plugins/*`), and that you'll follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md).
