# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor, Copilot and others) and contributors working in this repository. People setting up for the first time should read [CONTRIBUTING.md](CONTRIBUTING.md); this file is the short version plus the rules that are easy to break.

## What this is

QRdx is an open-source QR code platform (https://qrdx.dev): a free static QR generator, dynamic codes with hosted pages and analytics, a REST API, an MCP server, a CLI and a React library. It's a pnpm 10 workspace run with Turborepo, on Node.js 22.

| Path | What it is |
| --- | --- |
| `apps/docs` | The Next.js app behind qrdx.dev: marketing pages, the editor (`app/playground`), docs (`content/docs`, fumadocs), the signed-in app (`app/dashboard`, `app/settings`), API routes (`app/api`, served as `api.qrdx.dev/v1` and `mcp.qrdx.dev/mcp`) |
| `packages/qrdx` | The QR engine and React library, published to npm as `qrdx` |
| `packages/cli` | `@qrdx/cli`, the command-line generator |
| `packages/database` | Drizzle schema (`schema.ts`), migrations and `manual-sql/` |
| `packages/auth` | Better Auth setup |
| `packages/design-system` | Shared UI (shadcn/ui), icons, styles |
| `packages/integrations`, `packages/integration-kit` | The integrations catalogue and shared types |
| `packages/rate-limit`, `packages/next-config`, `packages/typescript-config` | Shared helpers and config |
| `plugins/*` | Chrome, Figma, Raycast and Canva plugins |
| `skills/` | Agent Skills, such as `generate-qr` |

## Run, test, check

```bash
pnpm install
pnpm --filter qrdx build:inplace     # the app imports the engine's dist/, so build it first
pnpm --filter docs dev               # http://localhost:3000 (needs apps/docs/.env.local, see CONTRIBUTING)

cd apps/docs
pnpm exec tsc --noEmit               # typecheck the app (run `pnpm exec next typegen` first on a fresh clone)
pnpm exec vitest run                 # unit and integration tests (tests/**); no database or network
pnpm test:node                       # node:test suites next to the code
../../node_modules/.bin/biome check --write <files you changed>
```

From the root, `pnpm prepush` runs everything the pre-push hook runs: engine build, both typechecks, `biome ci` and all tests. The e2e suites (`pnpm --filter docs test:e2e`, `test:e2e:app`, `test:e2e:site`) need a running dev server and Chrome.

## Rules

- **The engine is consumed through `dist/`.** After changing `packages/qrdx/src`, rebuild with `pnpm --filter qrdx build:inplace`. Never run `pnpm build` in `packages/qrdx` while a dev server is running: it deletes `dist/` first and breaks the running app.
- **Treat the database as shared and live.** `DATABASE_URL` may point at a database with real users (a self-hoster's production, or one database shared by dev and prod). Never run `pnpm db:push`, migrations, destructive SQL or scripts that write data against a database you weren't told is disposable. Schema changes are additive and idempotent: new columns nullable or defaulted, no drops or renames in the same change. When you can't apply a change yourself, write it to `packages/database/manual-sql/` and say so.
- **No placeholders in shipped content.** Docs, legal pages and UI copy go live as written: no `[[PLACEHOLDER]]` (a test fails on them), no "TBD", no invented examples presented as real.
- **Honest copy.** Never describe a feature that isn't built or isn't available on the deployment. Product counts come from code, not from memory: write `{facts.bodyPatterns}` and the other tokens from `apps/docs/lib/product-facts.ts` in MDX, and import the catalogues in TSX. Features that need setup are gated by `lib/feature-availability*`; docs use `<IfAvailable>`.
- **UI conventions.** Icons come from `iconsax-reactjs` (extra ones live in `packages/design-system/components/icons.tsx`). Don't edit `packages/design-system/components/ui/**`; compose around it. Keep the look monochrome with one accent colour.
- **Keep secrets out.** Never print or commit `.env` values, session cookies or tokens. Tests use fakes (`apps/docs/tests/support/`).
- **This Next.js has breaking changes from what you may know.** Read the guides in `apps/docs/node_modules/next/dist/docs/` before relying on memory. `apps/docs/AGENTS.md` is written by `next dev`; leave it alone.

## For agents using QRdx (not editing it)

- Site index: https://qrdx.dev/llms.txt, full docs: https://qrdx.dev/llms-full.txt, any docs page as Markdown: add `.md` to its URL.
- MCP server: `https://mcp.qrdx.dev/mcp` (Streamable HTTP, no key). REST API: `https://api.qrdx.dev/v1`, described by https://qrdx.dev/openapi.json.
- How-to: https://qrdx.dev/docs/developers/ai-agents

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, project layout, checks and pull requests
- [SECURITY.md](SECURITY.md): report vulnerabilities privately, never in a public issue
- [TRADEMARK.md](TRADEMARK.md): the code is open source; the QRdx name and logo are not
- [license.md](license.md): AGPL-3.0-or-later for the app; `packages/qrdx`, `packages/cli` and `plugins/*` are MIT (their own `LICENSE` files)
