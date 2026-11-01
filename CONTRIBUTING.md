# Contributing to QRdx

Thanks for your interest in contributing. This guide covers local setup, the project layout, the checks to run before opening a pull request, and how we review changes.

Not sure where to start? Look for issues labeled [`good first issue`](https://github.com/bucharitesh/qrdx/labels/good%20first%20issue). For questions, use [GitHub Discussions](https://github.com/bucharitesh/qrdx/discussions). To report a security problem, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Prerequisites

- Node.js 20 or newer
- pnpm 10 (the exact version is pinned in `package.json` under `packageManager`; `corepack enable` picks it up)
- A Postgres database for the web app: a free [Neon](https://neon.tech) database, or the Docker Compose Postgres described below

You don't need a database or any environment variables to work on the React library (`packages/qrdx`) or the CLI (`packages/cli`).

## Local setup

1. **Fork and clone**

   ```bash
   git clone https://github.com/<your-username>/qrdx.git
   cd qrdx
   git checkout -b my-change
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

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

   Open http://localhost:3000.

## Project structure

| Path | What it is |
| --- | --- |
| `apps/docs` | The Next.js app behind qrdx.dev: landing pages, the QR editor (`/playground`), docs (`content/docs`), blog, settings, admin and API routes (`app/api`) |
| `packages/qrdx` | The React QR code library, published to npm as `qrdx` |
| `packages/cli` | The command-line tool, published to npm as `@qrdx/cli` |
| `packages/auth` | Better Auth server and client configuration |
| `packages/database` | Drizzle schema (`schema.ts`) and database client |
| `packages/design-system` | Shared UI components (shadcn/ui), styles and fonts |
| `packages/integrations`, `packages/integration-kit` | Dub and Google Drive integrations and the shared integration types |
| `packages/rate-limit` | Upstash-based rate limiting |
| `packages/next-config`, `packages/typescript-config` | Shared Next.js config and env keys, shared tsconfig presets |
| `plugins/raycast`, `plugins/canva` | Raycast extension and Canva app |
| `skills/` | Agent skills, such as `generate-qr` |

## Checks before you open a pull request

CI (`.github/workflows/ci.yml`) runs these on every pull request:

```bash
pnpm turbo build --filter=qrdx      # the docs app and CLI use qrdx's build output
pnpm typecheck                      # all packages with a typecheck script
pnpm --filter docs exec next typegen && pnpm typecheck:docs
./apps/docs/node_modules/.bin/biome ci .
```

The test suites run before every `git push` instead: the Husky `pre-push` hook runs `pnpm prepush` (engine build, both typechecks, Biome and `pnpm test` across the monorepo). Run it yourself with `pnpm prepush`.

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

Edit `packages/database/schema.ts`, apply it to your development database with `pnpm db:push`, and describe the schema change in your pull request.

## Pull requests

- Open pull requests against `main` and keep each one focused on a single change.
- Use a [Conventional Commits](https://www.conventionalcommits.org/) style title, for example `feat(editor): add frame presets` or `fix(cli): handle missing sharp`.
- Fill in the pull request template. For UI changes, include before and after screenshots.
- Update the docs (`apps/docs/content/docs`) or package READMEs when you change behavior or public APIs.
- Make sure the checks above pass. A maintainer reviews every pull request before it's merged.

By contributing, you agree that your contributions are licensed under the project's [AGPL-3.0-or-later license](license.md) and that you'll follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md).
