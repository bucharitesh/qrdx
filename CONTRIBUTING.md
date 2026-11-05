# Contributing to QRdx

Thanks for your interest in contributing. This guide covers local setup, the project layout, the checks to run before opening a pull request, and how we review changes.

Not sure where to start? See [Good first issues](#good-first-issues) below. For questions, use [Q&A in Discussions](https://github.com/bucharitesh/qrdx/discussions/categories/q-a), and [SUPPORT.md](SUPPORT.md) lists where everything else goes. To report a security problem, follow [SECURITY.md](SECURITY.md) instead of opening a public issue. If you work with a coding agent, [AGENTS.md](AGENTS.md) has the short version of this guide and the rules that are easy to break.

## Prerequisites

- Node.js 22, version 22.22.3 or later (CI, Docker and production run Node 22)
- pnpm 10 (the exact version is pinned in `package.json` under `packageManager`; `corepack enable` picks it up)
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
   pnpm install
   pnpm --filter qrdx build:inplace
   ```

   The app imports the QR engine from `packages/qrdx/dist`, so build it once after installing, and again with `build:inplace` after you change `packages/qrdx/src`. Git hooks rebuild it for you when a pull, rebase or branch switch changes the engine (set `QRDX_SKIP_ENGINE_REBUILD=1` to skip that). Don't run `pnpm build` inside `packages/qrdx` while the dev server is running: it deletes `dist/` first, and the app breaks until the build finishes.

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
   pnpm db:push
   ```

   `pnpm db:push` changes whatever database `DATABASE_URL` points at. Only run it against a development database of your own that you can throw away, never a shared or production one.

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
   pnpm --filter docs dev
   ```

   Open http://localhost:3000. On a fresh clone, run `pnpm --filter docs exec next typegen` once before your first typecheck.

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

CI (`.github/workflows/ci.yml`) runs these on every pull request and on every push to `main` and `staging`. Both branches require the job to pass before anything merges.

```bash
pnpm turbo build --filter=qrdx      # the docs app and CLI use qrdx's build output
pnpm --filter @qrdx/cli build       # the CLI tests run its built dist/index.js
pnpm typecheck                      # all packages with a typecheck script
pnpm --filter docs exec next typegen && pnpm typecheck:docs
pnpm test                           # every package's tests
./apps/docs/node_modules/.bin/biome ci .
```

The Husky `pre-push` hook runs the same checks locally with `pnpm prepush` (engine build, both typechecks, Biome, the CLI build and `pnpm test`). Run it yourself with `pnpm prepush`, or skip it once with `git push --no-verify`.

To auto-fix formatting and import order in the files you changed:

```bash
./apps/docs/node_modules/.bin/biome check --write <files>
```

### Tests

| Suite | Where | Run |
| --- | --- | --- |
| Unit and integration (Vitest) | `apps/docs/tests/**`, `packages/*/tests` | `pnpm --filter docs test:unit`, or `pnpm test` for the monorepo |
| node:test suites next to the code | `apps/docs/**/*.test.ts` outside `tests/` and `e2e/` | `pnpm --filter docs test:node` |
| Playground e2e | `apps/docs/e2e/playground.e2e.ts` | `pnpm --filter docs test:e2e` |
| Signed-in app e2e | `apps/docs/e2e/app.e2e.ts` | `pnpm --filter docs test:e2e:app` (needs a session cookie, below) |
| Public site e2e | `apps/docs/e2e/site.e2e.ts` | `pnpm --filter docs test:e2e:site` |

`pnpm prepush` runs the first two. They need no database, network or email: route handlers run against an in-memory database (`apps/docs/tests/support/fake-db.ts`) that evaluates the app's real Drizzle queries. A known bug can be recorded as `it.fails` with a `// BUG (file): …` comment until it's fixed.

The e2e suites drive headless Chrome over the DevTools Protocol, so they need Chrome (or `CHROME_PATH`) and a running dev server (`pnpm --filter docs dev`). They aren't part of `pnpm prepush`. Each one exits 0 with a notice when the server or Chrome is missing. `E2E_BASE_URL` points them at another server, and `E2E_SUITES` runs some of their areas, for example `E2E_SUITES=oauth,webhooks` or `E2E_SUITES=image,mcp`.

The app suite signs in with a test account's Better Auth session cookie. Sign in to your local app with a throwaway account, copy the `better-auth.session_token` cookie, and pass it as `E2E_SESSION_COOKIE='better-auth.session_token=<value>'` or put that pair in a file named by `E2E_COOKIE_FILE`. Never commit it. The suite creates codes, a folder, a tag, a hosted page, an OAuth app and (on Business) a webhook, all named `E2E …`, under that account and deletes them again. Webhook URLs only ever point at `https://example.com`.

### Database changes

Edit `packages/database/schema.ts` and apply it to your own development database with `pnpm db:push`.

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
