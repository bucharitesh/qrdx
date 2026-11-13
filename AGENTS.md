# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor, Copilot and others) and contributors working in this repository. People setting up for the first time should read [CONTRIBUTING.md](CONTRIBUTING.md); this file is the short version plus the rules that are easy to break.

## What this is

QRdx is an open-source QR code platform (https://qrdx.dev): a free static QR generator, dynamic codes with hosted pages and analytics, a REST API, an MCP server, a CLI and a React library. It's a Turborepo monorepo that uses Bun 1.4 to install packages and run scripts, and Node.js 22 to run the app, the tests and the builds.

| Path | What it is |
| --- | --- |
| `apps/docs` | The Next.js app behind qrdx.dev: marketing pages, the editor (`app/(app)/playground`), docs (`content/docs`, fumadocs), the signed-in app (`app/(app)/dashboard`, `app/(app)/settings`), API routes (`app/api`, served as `api.qrdx.dev/v1` and `mcp.qrdx.dev/mcp`) |
| `packages/qrdx` | The QR engine and React library, published to npm as `qrdx` |
| `packages/cli` | `@qrdx/cli`, the command-line generator |
| `packages/database` | Drizzle schema (`schema.ts`), migrations and `manual-sql/` |
| `packages/auth` | Better Auth setup |
| `packages/design-system` | Shared UI (shadcn/ui), icons, styles, the logo, figures, JSON-LD helpers and the Open Graph image frame with its fonts |
| `packages/integrations`, `packages/integration-kit` | The integrations catalogue and shared types |
| `packages/config` | `@repo/config`: platform constants (brand, URLs, contact emails, social links, shared limits); import these instead of typing `qrdx.dev` or an email address |
| `packages/availability` | `@repo/availability`: which built-in features a deployment can offer, from the names of the variables it has set (pure; the app passes its environment in) |
| `packages/rate-limit`, `packages/next-config`, `packages/typescript-config` | Shared helpers and config |
| `plugins/*` | Chrome, Figma, Raycast and Canva plugins |
| `skills/` | Agent Skills, such as `generate-qr` |

## Run, test, check

```bash
bun install
bun run --filter qrdx build:inplace     # the app imports the engine's dist/, so build it first
bun run --filter docs dev               # http://localhost:3000 (needs apps/docs/.env.local, see CONTRIBUTING)
bun x ultracite fix <files you changed> # format and lint (Ultracite runs Biome)

cd apps/docs
bun x tsc --noEmit                      # typecheck the app (on a fresh clone, run `bun run typegen:docs` from the root first)
bun x vitest run                        # unit and integration tests (tests/**); no database or network
bun run test:node                       # node:test suites next to the code
```

The pre-push hook runs the engine build, both typechecks, the lint check (`bun run lint:ci`, which is `ultracite check`) and the tests of the packages your branch changes compared with `origin/staging`, plus the packages that depend on them (`turbo --affected`; unchanged results come from the turbo cache). `bun run prepush`, or `QRDX_PREPUSH=full git push`, runs every test. CI runs on every pull request (affected packages for pull requests into `staging`, everything for release pull requests into `main`) and on every push to `staging` and `main` (everything). A release pull request and the push to `main` reuse the staging run when the code is identical, so a release doesn't wait for the suite again (`scripts/ci-reuse-check.sh`). The e2e suites (`bun run --filter docs test:e2e`, `test:e2e:app`, `test:e2e:site`) need a running dev server and Chrome.

## Rules

- **The engine is consumed through `dist/`.** After changing `packages/qrdx/src`, rebuild with `bun run --filter qrdx build:inplace`. Never run `bun run build` in `packages/qrdx` while a dev server is running: it deletes `dist/` first and breaks the running app. Pulls, rebases and branch switches that change the engine rebuild it for you (`.husky/post-merge`, `post-checkout`, `post-rewrite` run `scripts/rebuild-engine-if-changed.sh`; skip with `QRDX_SKIP_ENGINE_REBUILD=1`).
- **Bun installs, Node runs.** Bun is only the package manager and script runner. Next.js, Vitest, the `node --test` suites, Vercel and Docker all run on Node.js 22, so don't add `--bun` to scripts. Run tests with `bun run test` (or `bun run test:node`, `bun x vitest run`), never `bun test`: that's Bun's own test runner, and these suites aren't written for it. Add a dependency with `bun add <dep>` (`-d` for dev) inside the package that imports it, and commit `bun.lock`. Packages are installed isolated, so code can only import what its own `package.json` lists.
- **Treat the database as shared and live.** `DATABASE_URL` may point at a database with real users (a self-hoster's production, or one database shared by dev and prod). Never run `bun run db:push`, migrations, destructive SQL or scripts that write data against a database you weren't told is disposable. Schema changes are additive and idempotent: new columns nullable or defaulted, no drops or renames in the same change. When you can't apply a change yourself, write it to `packages/database/manual-sql/` and say so.
- **No placeholders in shipped content.** Docs, legal pages and UI copy go live as written: no `[[PLACEHOLDER]]` (a test fails on them), no "TBD", no invented examples presented as real.
- **Honest copy.** Never describe a feature that isn't built or isn't available on the deployment. Product counts come from code, not from memory: write `{facts.bodyPatterns}` and the other tokens from `apps/docs/lib/product-facts.ts` in MDX, and import the catalogues in TSX. Features that need setup are gated by `lib/feature-availability*` (the rules are in `packages/availability`); docs use `<IfAvailable>`.
- **Translated pages read their copy from `apps/docs/messages/en.json`.** The header, footer, cookie banner, home page and `/pricing` live under `app/[lang]` and exist in every language in `lib/i18n/config.ts`. Change their English in `en.json` (counts and prices stay in code as ICU arguments), then run `bun run --filter docs i18n:translate --all` if you have an AI Gateway key; otherwise the new strings show in English until someone does. `bun run --filter docs i18n:check` must pass. Every other page lives under `app/(app)`; a page added straight under `app/` is moved by `bun run --filter docs i18n:split`. CONTRIBUTING.md, "Translating QRdx", covers adding a language.
- **Write like a person.** Use the humanizer skill (`.claude/skills/humanizer`) when writing or editing blog posts and other long-form copy.
- **UI conventions.** Icons come from `iconsax-reactjs` (extra ones live in `packages/design-system/components/icons.tsx`). Don't edit `packages/design-system/components/ui/**`; compose around it. Keep the look monochrome with one accent colour.
- **Environment variables are declared, then read through `env`.** Each package declares the variables it reads in its `keys.ts`; `apps/docs/env.ts` extends them and adds the app's own. Code reads `env` (`import { env } from "@/env"`) or the package's `keys()` rather than `process.env`; the exceptions are `NODE_ENV` and literal `NEXT_PUBLIC_*` reads in client-safe modules, which Next inlines. Only `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `BETTER_AUTH_SECRET` are required; a new variable is optional and switches off only its own feature. List it in `apps/docs/.env.example` too (a test checks), the only env file a contributor copies (to `apps/docs/.env.local`).
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
- [LICENSE](LICENSE) and [LICENSING.md](LICENSING.md): AGPL-3.0-or-later for the app; `packages/qrdx`, `packages/cli`, `plugins/*`, `skills/generate-qr` and `apps/docs/registry/qrdx` are MIT (their own `LICENSE` files)
