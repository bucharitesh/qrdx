# @repo/availability

Which built-in features a QRdx deployment can offer (custom domains, AI, file storage, email, the chat bots, workspace SSO and so on), decided from what is configured on QRdx's side. Plain TypeScript with no React and no environment access: the app passes its environment in, and only "is this variable set" is read (plus the app URL for passkeys and qrdx.dev-only features). Safe to import from client components, server code and the edge.

```ts
import { computeFeatures, toPublicAvailability } from "@repo/availability";

const features = computeFeatures({ env, onVercel, production });
```

| Module | What it holds |
| --- | --- |
| `rules.ts` (`@repo/availability`) | `FEATURE_IDS`, `FEATURE_RULES` (what each feature needs, the pages and catalog entries that only offer it), `computeFeatures`, `missingFeatureSetup`, `customDomainMode`, the catalog helpers, and what the app tells others: `PublicAvailability` (sent to browsers by the root layout), `PublishedAvailability` (served at `PUBLISHED_AVAILABILITY_PATH`), `isPathShown` |
| `deployment.ts` (`@repo/availability/deployment`) | `isQrdxDeployment` and `isLocalHost`: whether a deployment is QRdx itself (qrdx.dev, its previews, local dev) or a self-hosted copy on its own domain |
| `flags.ts` (`@repo/availability/flags`) | `isFlagOn`: "1" or "true" turns a flag on |
| `workspace-pattern.ts` (`@repo/availability/workspace-pattern`) | Reading a workspace from a `/dashboard/<slug>/…` path, and the `/dashboard/[workspace]/…` pattern rules use to name every workspace's page at once |

## How the app uses it

- `apps/app/lib/feature-availability.ts` (server only) feeds the rules the server environment: `isFeatureAvailable`, `getFeatures`, `isPathAvailable`.
- `apps/app/lib/integration-availability.ts` adds the integrations (it reads the database, so it stays in the app) and builds the `PublicAvailability` the root layout passes to client components (`useAvailability()` in `components/availability-provider.tsx`).
- `/zone/availability.json` (`app/zone/availability.json/route.ts`) publishes the same thing plus the ids that are on, for QRdx's other deployments: the docs app reads it at build time. Ids, paths and slugs only, built once per deploy, cached publicly (`tests/routes/zone-availability.test.ts` checks it carries nothing else).
- `apps/app/lib/feature-availability-rules.ts`, and the helpers re-exported from `lib/workspace-paths.ts`, `lib/mcp-clients.ts` and `lib/pricing.ts`, keep the app's import paths working.

The tests for the rules live in the app: `apps/app/tests/lib/feature-availability.test.ts`.

## Adding a feature

Add its id to `FEATURE_IDS` and a rule to `FEATURE_RULES`: the variables it needs (names only), `usable` when set values can still be wrong, and the `paths` and `catalogSlugs` that only lead to it. The app then hides those pages and entries wherever the feature can't work, and the docs wrap their mentions in `<IfAvailable feature="…">`. List new variables in `apps/app/.env.example`.
