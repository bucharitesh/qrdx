# @repo/docs-assets

Files the docs render and the main app serves, kept outside `apps/app` so another app can read the same copies.

| Path | What it is | Written by |
| --- | --- | --- |
| `openapi.json` | A copy of the REST API's OpenAPI document, `apps/app/public/openapi.json`, for an app that can't read the main app's files. Not committed (`.gitignore`): an app that imports it runs the command first, before it builds or starts | `bun run --filter app openapi:export` (`apps/app/scripts/openapi/export.ts`) |
| `registry.json` | The shadcn/ui registry index: one item per component, with its files | By hand |
| `registry/qrdx/*` | The registry components' sources, published with their imports rewritten (`registry/transform.ts`) | By hand |
| `registry/examples/*` | The live examples on the component docs pages, and `examples/index.tsx`, which loads each one on its own | By hand |
| `registry/ui/*`, `registry/lib/utils.ts` | Aliases to `@repo/design-system`, standing in for a project's shadcn/ui components and `cn` | By hand |
| `registry/outputs.ts`, `registry/build.ts` | What `/r/<name>.json` contains, and the script that writes it to a folder | |
| `pattern-catalog.ts` | Every body pattern, eye, eye centre and frame the engine has, with its picker category, popularity and scan risk (the style pickers, the docs catalogue and presets) | By hand, when the engine adds a value (tsc fails until it's listed) |
| `qr-catalog-tiles.ts` | The tiles of the docs style catalogue (`/docs/styles`): each option on plain square shapes. The main app draws them at `/catalog/<tile id>.svg` | From `pattern-catalog.ts` |

```ts
import openapi from "@repo/docs-assets/openapi.json"; // after `bun run --filter app openapi:export`
import registry from "@repo/docs-assets/registry.json";
import { examples } from "@repo/docs-assets/registry/examples";
import { toConsumerSource, toTargetPath } from "@repo/docs-assets/registry/transform";
import { BODY_CATALOG } from "@repo/docs-assets/pattern-catalog";
import { tilesFor } from "@repo/docs-assets/qr-catalog-tiles";
```

## Served copies

The main app serves these from `apps/app/public`, so the URLs answer with static files and the headers in `apps/app/next.config.ts`:

- `/openapi.json` (also `api.qrdx.dev/openapi.json`) is `apps/app/public/openapi.json`, the committed OpenAPI document. `bun run --filter app openapi:generate` writes it from the API's schemas in `apps/app/lib/openapi`, and the main app's API reference pages render it (`apps/app/lib/api-reference.ts`). This package's `openapi.json` is copied from it on demand, so it can't fall behind.
- `/r/<name>.json` is `apps/app/public/r`, written by `bun run --filter app registry:build` (`registry/build.ts --out public/r`) after you change `registry.json` or a source under `registry/`.

`apps/app/tests/api/openapi.test.ts` and `apps/app/tests/docs/registry-build.test.ts` fail while a served file is stale.

## The `@/registry/*` imports

The registry sources import each other as `@/registry/ui/button`, `@/registry/lib/utils` and `@/registry/qrdx/qr-code`, the paths `registry/transform.ts` rewrites to a shadcn/ui project's `@/components/...` and `@/lib/utils`. Keep those imports: the published sources depend on them. Any app that compiles the sources maps the prefix to this folder, in its `tsconfig.json` paths (`"@/registry/*": ["../../packages/docs-assets/registry/*"]`) and its test runner's aliases (`apps/app/vitest.config.ts`).

Reading a source as text (for a code tab) goes through the file system: `apps/docs/components/docs/registry/registry-data.ts` reads `../../packages/docs-assets/registry/<file>` from the app's folder.

## Linting

`biome.jsonc` here repeats `apps/app/biome.jsonc`, where these files used to live. The root config would reformat them (ES5 trailing commas, sorted classes) and change what `shadcn add` installs.
