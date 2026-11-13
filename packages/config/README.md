# @repo/config

Platform constants for the QRdx app and the internal packages, so code imports one source instead of typing the values again. Plain TypeScript with no React, safe to import from client components, server code and the edge.

```ts
import { CANONICAL_ORIGIN, SUPPORT_EMAIL, MAX_CODES_PER_REQUEST } from "@repo/config";
```

| Module | What it holds |
| --- | --- |
| `brand.ts` | The product name and the GitHub repository |
| `urls.ts` | The hosted service's addresses (`qrdx.dev`, the API at `api.qrdx.dev/v1`, the MCP server at `mcp.qrdx.dev/mcp`, the shadcn registry) and `isQrdxHost()` |
| `origins.ts` | The two origins that depend on the environment, imported as `@repo/config/origins`: `appOrigin()` (`NEXT_PUBLIC_APP_URL`) and `shortLinkOrigin()` (`NEXT_PUBLIC_SHORT_LINK_BASE_URL`, falling back to the origin it's given). They stay out of the main entry so the tools that compile `next.config.ts` and the docs source config only see plain values |
| `contact.ts` | The email addresses people are told to write to |
| `social.ts` | Profiles and listings the site links to |
| `limits.ts` | Platform limits that more than one part of QRdx enforces or quotes: editor uploads, AI caps, theme caps, batch sizes, the keyless endpoints' rate limits |
| `facts.ts` | Product counts and names quoted in copy, imported as `@repo/config/facts`, for apps that can't import the main app (the docs site). `createFacts(snapshot)` gives them the main app's API (`PRODUCT_FACTS`, `STYLE_SUMMARY`, `productFact()`, `isProductFact()`, `fillFacts()`, `fillFactsDeep()`) over a snapshot of `apps/docs/lib/product-facts.ts` that `bun run --filter docs facts:snapshot` writes to `facts.generated.json` just before such an app builds. The file isn't committed, so it can't go stale |
| `keys.ts` | The environment variable this package reads, validated like every other `keys.ts`; `apps/docs/env.ts` extends it |

## What belongs here

A value goes here when it's a plain constant (or a pure function of one) that more than one place uses, or that names the hosted service: an origin, a host, an email address, a profile URL, a numeric cap.

## What doesn't

- Copy and JSX: marketing text, navigation and footers stay in `apps/docs/config/site.tsx`, product counts in `apps/docs/lib/product-facts.ts` (this package only holds its generated snapshot), the default QR theme in `apps/docs/config/qr.ts`.
- Plan limits and anything that needs the database, the session or a plan lookup (`apps/docs/lib/plans.ts`).
- Values only one screen uses, such as debounce delays, page sizes and tag lists.
- Next.js configuration and the core environment keys, which live in `@repo/next-config`.
- Modules that `apps/docs/next.config.ts` loads from below the app's root, such as `lib/security/csp.ts`: Next.js compiles the config with the `@repo/*` path rewritten for the app's root, so a nested file can't import a workspace package there. They keep their literals.
- The published packages (`packages/qrdx`, `packages/cli`, `plugins/*`) and the shadcn registry sources (`packages/docs-assets/registry`) never import this package: they ship outside the monorepo, so they keep their own literals.
