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
| `apps/docs` | The Next.js app behind qrdx.dev: marketing pages, the editor (`app/playground`), docs (`content/docs`), the blog, the signed-in app (`app/dashboard`, `app/settings`), admin, and the API routes (`app/api`, served as `api.qrdx.dev/v1` and `mcp.qrdx.dev/mcp`) |
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
