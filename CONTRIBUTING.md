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

### Database changes

Edit `packages/database/schema.ts`, apply it to your development database with `pnpm db:push`, and describe the schema change in your pull request.

## Pull requests

- Open pull requests against `main` and keep each one focused on a single change.
- Use a [Conventional Commits](https://www.conventionalcommits.org/) style title, for example `feat(editor): add frame presets` or `fix(cli): handle missing sharp`.
- Fill in the pull request template. For UI changes, include before and after screenshots.
- Update the docs (`apps/docs/content/docs`) or package READMEs when you change behavior or public APIs.
- Make sure the checks above pass. A maintainer reviews every pull request before it's merged.

By contributing, you agree that your contributions are licensed under the project's [AGPL-3.0-or-later license](license.md) and that you'll follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md).
