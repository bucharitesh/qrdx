// Imported first by scripts/i18n-check.ts and scripts/i18n-translate.ts.
// The content sources (lib/i18n/content-sources.ts) import app modules to
// read their English copy:
// - some validate the environment when loaded (lib/landing/blocks reaches
//   the database keys): the scripts never connect to anything, so in CI or a
//   fresh clone they get placeholders; values already set are kept;
// - some are marked server-only (lib/plans.ts holds the plan limits the
//   copy quotes): these scripts aren't a client bundle, so that guard
//   resolves to an empty module here.
import Module from "node:module";
import path from "node:path";

process.env.DATABASE_URL ??= "postgresql://i18n-scripts.invalid/unused";
process.env.NEXT_PUBLIC_APP_URL ??= "https://qrdx.dev";

type Resolve = (request: string, ...rest: unknown[]) => string;
const loader = Module as unknown as { _resolveFilename: Resolve };
const resolve = loader._resolveFilename;
const EMPTY = path.join(__dirname, "../tests/support/empty.ts");
loader._resolveFilename = function (this: unknown, request, ...rest) {
  return request === "server-only"
    ? EMPTY
    : resolve.call(this, request, ...rest);
};
