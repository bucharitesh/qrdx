# apps/docs

The Next.js app behind [qrdx.dev](https://qrdx.dev): the marketing pages, the playground, the docs, the signed-in dashboard and the API. It's licensed under AGPL-3.0-or-later, like the rest of the repository outside the MIT folders ([LICENSING.md](../../LICENSING.md)).

| Path | What's there |
| --- | --- |
| `app/playground` | The editor at [qrdx.dev/playground](https://qrdx.dev/playground) |
| `app/(home)` | Marketing pages, tools, the community and the blog |
| `content/docs` | The docs at [qrdx.dev/docs](https://qrdx.dev/docs) (Fumadocs MDX) |
| `app/dashboard`, `app/settings` | The signed-in app: codes, pages, analytics, workspaces |
| `app/api` | API routes, served as `api.qrdx.dev/v1` and `mcp.qrdx.dev/mcp` |
| `app/q`, `app/p` | Dynamic code redirects and hosted pages |

## Run it locally

The app imports the engine from `packages/qrdx/dist`, so build that first. From the repository root:

```bash
pnpm install
pnpm --filter qrdx build:inplace
pnpm --filter docs dev             # http://localhost:3000
```

It needs `apps/docs/.env.local` with at least `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `BETTER_AUTH_SECRET`. [CONTRIBUTING.md](../../CONTRIBUTING.md) walks through the setup, the checks to run and how to open a pull request. To run your own instance, follow the [self-hosting guide](https://qrdx.dev/docs/self-hosting).

## Checks

Run these in `apps/docs`:

```bash
pnpm exec tsc --noEmit    # typecheck (run `pnpm exec next typegen` first on a fresh clone)
pnpm exec vitest run      # unit and integration tests, no database or network
pnpm test:node            # node:test suites next to the code
```
