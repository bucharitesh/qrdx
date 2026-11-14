# apps/app

The Next.js app behind [qrdx.dev](https://qrdx.dev): the marketing pages, the playground, the signed-in dashboard and the API. The docs are their own app, [`apps/docs`](../docs/README.md), which this one serves at the same URLs when `DOCS_ZONE_URL` is set (without it, the docs' URLs redirect to qrdx.dev). It's licensed under AGPL-3.0-or-later, like the rest of the repository outside the MIT folders ([LICENSING.md](../../LICENSING.md)).

| Path | What's there |
| --- | --- |
| `app/(app)/playground` | The editor at [qrdx.dev/playground](https://qrdx.dev/playground) |
| `app/(app)/(home)` | Marketing pages, tools, the community and the blog |
| `content` | The blog, comparisons, customer stories, legal pages and changelog (Fumadocs MDX) |
| `app/(app)/dashboard`, `app/(app)/settings` | The signed-in app: codes, pages, analytics, workspaces |
| `app/api` | API routes, served as `api.qrdx.dev/v1` and `mcp.qrdx.dev/mcp` |
| `app/q`, `app/(app)/p` | Dynamic code redirects and hosted pages |

## Run it locally

The app imports the engine from `packages/qrdx/dist`, so build that first. From the repository root:

```bash
bun install
bun run --filter qrdx build:inplace
bun run --filter app dev            # http://localhost:3000
```

It needs `apps/app/.env.local` with at least `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `BETTER_AUTH_SECRET`. [CONTRIBUTING.md](../../CONTRIBUTING.md) walks through the setup, the checks to run and how to open a pull request. To run your own instance, follow the [self-hosting guide](https://qrdx.dev/docs/self-hosting).

## Checks

Run these in `apps/app`:

```bash
bun x tsc --noEmit        # typecheck (run `bun x next typegen` first on a fresh clone)
bun x vitest run          # unit and integration tests, no database or network
bun run test:node         # node:test suites next to the code
```
